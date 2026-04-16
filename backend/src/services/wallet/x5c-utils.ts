import crypto, { X509Certificate } from 'crypto';
import logger from '../../lib/logger';

/**
 * Generate a self-signed X.509 certificate from RSA key material.
 * Returns the PEM string (stored in DB) and the x5c base64-DER value (used in JWTs and DID docs).
 *
 * x5c format per RFC 7515 §4.1.6 and RFC 7517: base64-encoded DER, NO PEM headers/newlines.
 * Used to satisfy Gaia-X GXDCH compliance service x5c requirement.
 */
export function generateSelfSignedCert(
  privateKeyPem: string,
  publicKeyPem: string,
): { pem: string; x5cValue: string } | null {
  try {
    const now = new Date();
    const notAfter = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const certDer = buildSelfSignedCertDER(
      privateKeyPem,
      publicKeyPem,
      'CN=SmartSense Dataspace Demo,O=SmartSense Consulting Solutions,C=IN',
      now,
      notAfter,
    );
    // x5c: raw base64 of DER (no PEM markers, no line breaks) — RFC 7515 §4.1.6
    const x5cValue = certDer.toString('base64');
    // PEM: for human-readable storage in DB
    const lines = x5cValue.match(/.{1,64}/g) || [];
    const pem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
    return { pem, x5cValue };
  } catch (e) {
    logger.warn({ component: 'x5c-utils', err: (e as Error).message }, 'Failed to generate self-signed cert');
    return null;
  }
}

/**
 * Convert a stored PEM cert back to x5c base64-DER value for embedding in JWTs and DID documents.
 * Prefer OpenSSL-backed parse so DER matches what verifiers decode (avoids subtle PEM edge cases).
 */
export function certPemToX5cValue(pem: string): string {
  try {
    return Buffer.from(new X509Certificate(pem.trim()).raw).toString('base64');
  } catch (e) {
    logger.warn({ component: 'x5c-utils', err: (e as Error).message }, 'certPemToX5cValue: X509Certificate parse failed, falling back to PEM strip');
    return pem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
  }
}

/** @deprecated Use generateSelfSignedCert instead */
export function generateSelfSignedCertPem(privateKeyPem: string, publicKeyPem: string): string | null {
  return generateSelfSignedCert(privateKeyPem, publicKeyPem)?.pem ?? null;
}

// --------------- DER / ASN.1 helpers (ported from deleted VPSigner) ---------------

function buildSelfSignedCertDER(
  privateKeyPem: string,
  publicKeyPem: string,
  subjectDN: string,
  notBefore: Date,
  notAfter: Date,
): Buffer {
  const pubKeyDer = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }) as Buffer;
  const serialNumber = crypto.randomBytes(16);
  serialNumber[0] &= 0x7f;

  const tbs = buildTBS(serialNumber, parseDN(subjectDN), pubKeyDer, notBefore, notAfter);

  const signer = crypto.createSign('SHA256');
  signer.update(tbs);
  const signature = signer.sign(privateKeyPem);

  const algId = seq(Buffer.concat([oid([1, 2, 840, 113549, 1, 1, 11]), Buffer.from([0x05, 0x00])]));
  return seq(Buffer.concat([tbs, algId, bitStr(signature)]));
}

function buildTBS(serial: Buffer, subject: Buffer, pubKeyDer: Buffer, notBefore: Date, notAfter: Date): Buffer {
  return seq(Buffer.concat([
    Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]), // version: v3
    int(serial),
    seq(Buffer.concat([oid([1, 2, 840, 113549, 1, 1, 11]), Buffer.from([0x05, 0x00])])),
    subject, // issuer = subject (self-signed)
    seq(Buffer.concat([utcTime(notBefore), utcTime(notAfter)])),
    subject,
    pubKeyDer,
  ]));
}

function parseDN(dn: string): Buffer {
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
      ? wrap(0x13, Buffer.from(val, 'ascii'))
      : wrap(0x0c, Buffer.from(val, 'utf-8'));
    return wrap(0x31, seq(Buffer.concat([oid(o), str])));
  }).filter(b => b.length > 0);
  return seq(Buffer.concat(rdns));
}

function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
}
function wrap(tag: number, c: Buffer): Buffer { return Buffer.concat([Buffer.from([tag]), len(c.length), c]); }
function seq(c: Buffer): Buffer { return wrap(0x30, c); }
function int(v: Buffer): Buffer { const pad = v[0] & 0x80; return wrap(0x02, pad ? Buffer.concat([Buffer.from([0]), v]) : v); }
function bitStr(c: Buffer): Buffer { return wrap(0x03, Buffer.concat([Buffer.from([0]), c])); }
function oid(components: number[]): Buffer {
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
  return wrap(0x06, Buffer.from(b));
}
function utcTime(d: Date): Buffer {
  const p = (n: number) => n.toString().padStart(2, '0');
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return wrap(0x17, Buffer.from(s, 'ascii'));
}
