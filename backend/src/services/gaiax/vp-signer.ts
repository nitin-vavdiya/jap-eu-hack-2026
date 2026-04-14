import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import prisma from '../../db';
import logger from '../../lib/logger';

const KEYS_DIR = path.join(__dirname, '../../../.keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'gaiax-private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'gaiax-public.pem');

const KEYPAIR_ID = 'platform-signer';

/**
 * VP-JWT signer for Gaia-X compliance submission.
 *
 * Uses did:web with a persistent RSA keypair.
 * Keypair persistence priority: Database → Filesystem → Generate new.
 * This ensures keys survive container restarts even without volume mounts.
 *
 * Includes a self-signed X.509 certificate in x5c for the
 * GXDCH compliance service trust chain.
 */
export class VPSigner {
  private privateKey!: string;
  private publicKey!: string;
  private did!: string;
  private kid!: string;
  private x5c!: string[];
  private initialized = false;

  /**
   * Initialize the signer — loads keypair from DB, then filesystem, then generates new.
   * Must be called before any signing operations.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    let source = '';

    // 1. Try loading from database
    try {
      const row = await prisma.platformKeypair.findUnique({ where: { id: KEYPAIR_ID } });
      if (row) {
        this.privateKey = row.privateKey;
        this.publicKey = row.publicKey;
        source = 'database';
      }
    } catch {
      // Table might not exist yet (pre-migration) — fall through
    }

    // 2. Fallback: try loading from filesystem
    if (!source && fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
      this.privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
      this.publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');
      source = 'filesystem';
    }

    // 3. Fallback: generate new keypair
    if (!source) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      source = 'generated';
    }

    // Persist to both DB and filesystem for redundancy
    await this.persistKeys(source);

    // Build did:web from configurable domain
    const domain = process.env.GAIAX_DID_DOMAIN || 'localhost%3A8000';
    const didPath = process.env.GAIAX_DID_PATH || 'v1';
    this.did = `did:web:${domain}:${didPath}`;
    this.kid = `${this.did}#key-1`;

    // Generate self-signed X.509 cert for x5c header
    this.x5c = this.generateSelfSignedCert();

    this.initialized = true;

    // Log key fingerprint so we can verify same key across deploys
    const keyFingerprint = crypto.createHash('sha256')
      .update(this.publicKey)
      .digest('hex').slice(0, 16);
    logger.info({ component: 'vp-signer', source, did: this.did, keyFingerprint }, 'VPSigner initialized');
  }

  /**
   * Persist keys to both DB and filesystem for redundancy.
   */
  private async persistKeys(source: string): Promise<void> {
    // Save to DB if not already there
    if (source !== 'database') {
      try {
        await prisma.platformKeypair.upsert({
          where: { id: KEYPAIR_ID },
          create: { id: KEYPAIR_ID, privateKey: this.privateKey, publicKey: this.publicKey },
          update: { privateKey: this.privateKey, publicKey: this.publicKey },
        });
        logger.info({ component: 'vp-signer' }, 'Keypair saved to database');
      } catch (err: any) {
        logger.warn({ component: 'vp-signer', err: err.message }, 'Could not save keypair to database');
      }
    }

    // Save to filesystem if not already there
    if (source !== 'filesystem') {
      try {
        if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
        fs.writeFileSync(PRIVATE_KEY_PATH, this.privateKey, { mode: 0o600 });
        fs.writeFileSync(PUBLIC_KEY_PATH, this.publicKey);
        logger.info({ component: 'vp-signer', keysDir: KEYS_DIR }, 'Keypair saved to filesystem');
      } catch (err: any) {
        logger.warn({ component: 'vp-signer', err: err.message }, 'Could not save keypair to filesystem');
      }
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('VPSigner not initialized — call await getVPSigner() first');
    }
  }

  getDid(): string { this.ensureInitialized(); return this.did; }
  getKid(): string { this.ensureInitialized(); return this.kid; }

  getPublicKeyJwk(): Record<string, unknown> {
    this.ensureInitialized();
    const keyObject = crypto.createPublicKey(this.publicKey);
    const jwk = keyObject.export({ format: 'jwk' });
    return { ...jwk, kid: this.kid, alg: 'RS256', x5c: this.x5c };
  }

  getX5c(): string[] { this.ensureInitialized(); return this.x5c; }

  signVC(vcPayload: Record<string, unknown>): string {
    return this.signVCAs(vcPayload);
  }

  /**
   * Sign a VC-JWT on behalf of a specific DID (custodial signing).
   * Uses the platform's private key but sets iss/kid to the target DID.
   * If no identity override is provided, defaults to the platform's own DID.
   */
  signVCAs(vcPayload: Record<string, unknown>, identity?: { did: string; kid: string }): string {
    this.ensureInitialized();
    const targetDid = identity?.did || this.did;
    const targetKid = identity?.kid || this.kid;
    const now = Math.floor(Date.now() / 1000);
    // VC-JOSE-COSE spec: VC claims go at root of JWT payload (not inside a 'vc' wrapper)
    const payload = {
      ...vcPayload,
      iss: targetDid,
      sub: vcPayload.credentialSubject
        ? (vcPayload.credentialSubject as Record<string, unknown>)['id'] || (vcPayload.credentialSubject as Record<string, unknown>)['@id'] || targetDid
        : targetDid,
      nbf: now,
      exp: now + 365 * 24 * 3600,
      iat: now,
      jti: vcPayload.id || `urn:uuid:${crypto.randomUUID()}`,
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        typ: 'vc+jwt',
        cty: 'vc',
        kid: targetKid,
        iss: targetDid,
        x5c: this.x5c,
      } as jwt.JwtHeader & { cty: string; iss: string; x5c: string[] },
    });
  }

  signVP(vcJwts: string[], audience?: string): string {
    return this.signVPAs(vcJwts, undefined, audience);
  }

  /**
   * Sign a VP-JWT on behalf of a specific DID (custodial signing).
   * Uses the platform's private key but sets iss/kid/sub to the target DID.
   * If no identity override is provided, defaults to the platform's own DID.
   */
  signVPAs(vcJwts: string[], identity?: { did: string; kid: string }, audience?: string): string {
    this.ensureInitialized();
    const targetDid = identity?.did || this.did;
    const targetKid = identity?.kid || this.kid;
    const now = Math.floor(Date.now() / 1000);

    // VC-JOSE-COSE spec: VP claims go at root of JWT payload (not inside a 'vp' wrapper)
    // gx-compliance reads payload['verifiableCredential'] directly
    // EnvelopedVerifiableCredential id uses 'data:application/vc+jwt,' media type
    const verifiableCredential = vcJwts.map((vcJwt) => ({
      '@context': 'https://www.w3.org/ns/credentials/v2',
      type: 'EnvelopedVerifiableCredential',
      id: `data:application/vc+jwt,${vcJwt}`,
    }));

    const payload = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: 'VerifiablePresentation',
      verifiableCredential,
      issuer: targetDid,
      validFrom: new Date(now * 1000).toISOString(),
      validUntil: new Date((now + 3600) * 1000).toISOString(),
      iss: targetDid,
      sub: targetDid,
      aud: audience || 'https://compliance.lab.gaia-x.eu/development',
      nbf: now,
      exp: now + 3600,
      iat: now,
      jti: `urn:uuid:${crypto.randomUUID()}`,
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        typ: 'vp+jwt',
        cty: 'vp',
        kid: targetKid,
        iss: targetDid,
        x5c: this.x5c,
      } as jwt.JwtHeader & { cty: string; iss: string; x5c: string[] },
    });
  }

  // ─── Self-signed X.509 certificate generation ─────────────────

  private generateSelfSignedCert(): string[] {
    try {
      const now = new Date();
      const notAfter = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      const cert = this.buildSelfSignedCertDER(
        this.privateKey, this.publicKey,
        'CN=SmartSense Loire Demo,O=SmartSense Loire SAS,C=FR',
        now, notAfter,
      );
      // Format as PEM with proper line breaks for jose.importX509 compatibility
      // The compliance service checks for '-----BEGIN CERTIFICATE-----' prefix
      const b64 = cert.toString('base64');
      const lines = b64.match(/.{1,64}/g) || [];
      const pem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
      return [pem];
    } catch (e) {
      logger.warn({ component: 'vp-signer', err: (e as Error).message }, 'Failed to generate self-signed cert');
      return [];
    }
  }

  private buildSelfSignedCertDER(
    privateKeyPem: string, publicKeyPem: string,
    subjectDN: string, notBefore: Date, notAfter: Date,
  ): Buffer {
    const pubKeyDer = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    const serialNumber = crypto.randomBytes(16);
    serialNumber[0] &= 0x7f;

    const tbs = this.buildTBS(serialNumber, this.parseDN(subjectDN), pubKeyDer, notBefore, notAfter);

    const signer = crypto.createSign('SHA256');
    signer.update(tbs);
    const signature = signer.sign(privateKeyPem);

    const algId = this.seq(Buffer.concat([
      this.oid([1, 2, 840, 113549, 1, 1, 11]),
      Buffer.from([0x05, 0x00]),
    ]));

    return this.seq(Buffer.concat([tbs, algId, this.bitStr(signature)]));
  }

  private buildTBS(serial: Buffer, subject: Buffer, pubKeyDer: Buffer, notBefore: Date, notAfter: Date): Buffer {
    return this.seq(Buffer.concat([
      Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]), // v3
      this.int(serial),
      this.seq(Buffer.concat([this.oid([1, 2, 840, 113549, 1, 1, 11]), Buffer.from([0x05, 0x00])])),
      subject, // issuer = subject (self-signed)
      this.seq(Buffer.concat([this.utcTime(notBefore), this.utcTime(notAfter)])),
      subject,
      pubKeyDer,
    ]));
  }

  private parseDN(dn: string): Buffer {
    const oids: Record<string, number[]> = {
      CN: [2, 5, 4, 3], O: [2, 5, 4, 10], C: [2, 5, 4, 6],
      L: [2, 5, 4, 7], ST: [2, 5, 4, 8], OU: [2, 5, 4, 11],
    };
    const rdns = dn.split(',').map(p => p.trim()).map(part => {
      const [key, ...rest] = part.split('=');
      const val = rest.join('=');
      const o = oids[key.toUpperCase()];
      if (!o) return Buffer.alloc(0);
      const str = key.toUpperCase() === 'C'
        ? this.wrap(0x13, Buffer.from(val, 'ascii'))
        : this.wrap(0x0c, Buffer.from(val, 'utf-8'));
      return this.wrap(0x31, this.seq(Buffer.concat([this.oid(o), str])));
    }).filter(b => b.length > 0);
    return this.seq(Buffer.concat(rdns));
  }

  // ASN.1 DER helpers
  private len(n: number): Buffer {
    if (n < 0x80) return Buffer.from([n]);
    if (n < 0x100) return Buffer.from([0x81, n]);
    return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
  }
  private wrap(tag: number, c: Buffer): Buffer { return Buffer.concat([Buffer.from([tag]), this.len(c.length), c]); }
  private seq(c: Buffer): Buffer { return this.wrap(0x30, c); }
  private int(v: Buffer): Buffer { const pad = v[0] & 0x80; return this.wrap(0x02, pad ? Buffer.concat([Buffer.from([0]), v]) : v); }
  private bitStr(c: Buffer): Buffer { return this.wrap(0x03, Buffer.concat([Buffer.from([0]), c])); }
  private oid(components: number[]): Buffer {
    const b: number[] = [40 * components[0] + components[1]];
    for (let i = 2; i < components.length; i++) {
      let v = components[i];
      if (v < 128) { b.push(v); } else {
        const enc: number[] = [];
        enc.unshift(v & 0x7f); v >>= 7;
        while (v > 0) { enc.unshift((v & 0x7f) | 0x80); v >>= 7; }
        b.push(...enc);
      }
    }
    return this.wrap(0x06, Buffer.from(b));
  }
  private utcTime(d: Date): Buffer {
    const p = (n: number) => n.toString().padStart(2, '0');
    const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
    return this.wrap(0x17, Buffer.from(s, 'ascii'));
  }
}

// Singleton with async initialization
let _signer: VPSigner | null = null;
let _initPromise: Promise<VPSigner> | null = null;

/**
 * Get the initialized VPSigner singleton.
 * First call initializes from DB → filesystem → generate new.
 */
export async function getVPSignerAsync(): Promise<VPSigner> {
  if (_signer?.['initialized']) return _signer;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const signer = new VPSigner();
    await signer.init();
    _signer = signer;
    return signer;
  })();

  return _initPromise;
}

/**
 * Synchronous getter — returns the signer if already initialized.
 * Throws if called before async initialization completes.
 * Use getVPSignerAsync() for the first access.
 */
export function getVPSigner(): VPSigner {
  if (!_signer || !_signer['initialized']) {
    throw new Error('VPSigner not initialized yet — use await getVPSignerAsync() first');
  }
  return _signer;
}
