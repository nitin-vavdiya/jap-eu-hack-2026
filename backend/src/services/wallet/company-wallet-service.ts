import { randomUUID, createPrivateKey } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../db';
import logger from '../../lib/logger';
import { vaultKvReadJson } from '../vault/vault-kv';
import type { CompanyWalletProvisionResult } from './company-wallet-provisioning';
import type { IssuedWalletCredential } from './walt-oid4vci-issue';
import {
  exportWalletPrivateJwk,
  getWalletApiBaseUrl,
  walletLogin,
  type WalletSession,
} from './wallet-api-client';
import { issueJwtVcViaIssuerAndClaim } from './walt-oid4vci-issue';
import { WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID } from './waltid-oid4vci-defaults';
import { certPemToX5cValue } from './x5c-utils';

export type CompanyWalletContext = {
  session: WalletSession;
  walletId: string;
  rsaKeyId: string;
  ed25519KeyId: string;
};

export type { IssuedWalletCredential };

async function readCompanyWalletAuth(companyId: string): Promise<{ email: string; password: string } | null> {
  const fromVault = await vaultKvReadJson(`company/${companyId}/wallet`);
  if (fromVault?.accountEmail && fromVault?.accountPassword) {
    return { email: String(fromVault.accountEmail), password: String(fromVault.accountPassword) };
  }
  return null;
}

export async function getCompanyWalletContext(companyId: string): Promise<CompanyWalletContext | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      walletId: true,
      rsaKeyId: true,
      ed25519KeyId: true,
      walletProvisioned: true,
    },
  });
  if (!company?.walletProvisioned || !company.walletId || !company.rsaKeyId || !company.ed25519KeyId) {
    return null;
  }

  const auth = await readCompanyWalletAuth(companyId);
  if (!auth) {
    logger.warn({ component: 'company-wallet', companyId }, 'No Vault credentials for company wallet (path company/{id}/wallet)');
    return null;
  }

  try {
    const session = await walletLogin({ email: auth.email, password: auth.password, baseURL: getWalletApiBaseUrl() });
    return { session, walletId: company.walletId, rsaKeyId: company.rsaKeyId, ed25519KeyId: company.ed25519KeyId };
  } catch (e) {
    logger.warn({ component: 'company-wallet', companyId, err: (e as Error).message }, 'Company wallet login failed');
    return null;
  }
}


/**
 * Export the RSA private key from the wallet and return it as PEM.
 * Used for local JWT signing where we need full header control (Gaia-X requires iss in header).
 * The private key is held in memory transiently — never written to disk or DB.
 */
async function getCompanyPrivatePem(
  session: WalletSession,
  walletId: string,
  rsaKeyId: string,
): Promise<string | null> {
  const privateJwk = await exportWalletPrivateJwk(session, walletId, rsaKeyId);
  if (!privateJwk) {
    logger.warn({ component: 'company-wallet' }, 'Failed to export RSA private key from wallet');
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keyObj = createPrivateKey({ key: privateJwk as any, format: 'jwk' });
    return keyObj.export({ format: 'pem', type: 'pkcs8' }) as string;
  } catch (e) {
    logger.warn({ component: 'company-wallet', err: (e as Error).message }, 'Failed to convert private JWK to PEM');
    return null;
  }
}

/**
 * Sign a VC payload as a JWT using the company wallet's RSA private key.
 *
 * Gaia-X ICAM (credential format) requires VC-JWT with RS256, typ `vc+ld+json+jwt`, cty `vc+ld+json`,
 * flat payload (no `vc` / `vp` claims), and x5c in the header for GXDCH.
 *
 * @see https://docs.gaia-x.eu/technical-committee/identity-credential-access-management/24.07/credential_format/
 */
async function signVcJwtWithWalletRsaKey(params: {
  session: WalletSession;
  walletId: string;
  rsaKeyId: string;
  companyDid: string;
  vcPayload: Record<string, unknown>;
  rsaCertPem?: string | null;
}): Promise<IssuedWalletCredential | null> {
  const privatePem = await getCompanyPrivatePem(params.session, params.walletId, params.rsaKeyId);
  if (!privatePem) return null;

  const now = Math.floor(Date.now() / 1000);
  const kid = `${params.companyDid}#key-rsa`;
  const credentialId =
    typeof params.vcPayload.id === 'string' ? params.vcPayload.id : `urn:uuid:${randomUUID()}`;

  // Gaia-X ICAM §3.5.8.2: `iss`/`sub` map from `issuer` / `credentialSubject.id` — no duplicates.
  // §3.5.8.2: `jti` is replaced by credential `id` — do **not** emit both `id` and `jti` in the same VC-JWT
  // (Java VC-JWT decoders used by gx-compliance fail with "payload is not a valid JWT" otherwise).
  const rawPayload = { ...params.vcPayload } as Record<string, unknown>;
  delete rawPayload.iss;
  delete rawPayload.sub;
  delete rawPayload.jti;

  const payload: Record<string, unknown> = {
    ...rawPayload,
    iat: now,
    exp: now + 365 * 24 * 3600,
  };
  if (typeof payload.id !== 'string') {
    payload.id = credentialId;
  }

  try {
    // gx-compliance expects typ: vc+jwt, cty: vc (matches CTY_VALUE='vc', TYP_VALUE='vc+jwt' in compliance service constants).
    // x5c is NOT included in the JWT header — gx-compliance uses x5u from the DID doc's publicKeyJwk instead
    // (jose.importX509 fails for PEM-wrapped x5c without line breaks; x5u fetches proper PEM).
    const header: jwt.JwtHeader & { cty?: string; iss?: string } = {
      alg: 'RS256',
      typ: 'vc+jwt',
      cty: 'vc',
      kid,
      iss: params.companyDid,
    };
    const signed = jwt.sign(payload, privatePem, { algorithm: 'RS256', header });
    return { jwt: signed, walletCredentialId: credentialId };
  } catch (e) {
    logger.warn({ component: 'company-wallet', err: (e as Error).message }, 'signVcJwtWithWalletRsaKey failed');
    return null;
  }
}

export async function issueLegalParticipantVcJwtWithProvisionResult(params: {
  provision: CompanyWalletProvisionResult;
  companyDid: string;
  vcPayload: Record<string, unknown>;
}): Promise<IssuedWalletCredential | null> {
  const session = await walletLogin({
    email: params.provision.accountEmail,
    password: params.provision.accountPassword,
    baseURL: getWalletApiBaseUrl(),
  });
  return signVcJwtWithWalletRsaKey({
    session,
    walletId: params.provision.walletId,
    rsaKeyId: params.provision.rsaKeyId,
    companyDid: params.companyDid,
    vcPayload: params.vcPayload,
    rsaCertPem: params.provision.rsaCertPem,
  });
}

export async function issueLegalParticipantVcJwtForCompany(params: {
  companyId: string;
  companyDid: string;
  vcPayload: Record<string, unknown>;
}): Promise<IssuedWalletCredential | null> {
  const ctx = await getCompanyWalletContext(params.companyId);
  if (!ctx) return null;

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { rsaCertPem: true },
  });

  return signVcJwtWithWalletRsaKey({
    session: ctx.session,
    walletId: ctx.walletId,
    rsaKeyId: ctx.rsaKeyId,
    companyDid: params.companyDid,
    vcPayload: params.vcPayload,
    rsaCertPem: company?.rsaCertPem,
  });
}

/**
 * Store a VC payload in the company's walt.id wallet via OID4VCI (issuer API → offer → claim).
 *
 * The `/credentials/import` REST endpoint does not exist in the deployed walt.id version.
 * The only working write path is `exchange/useOfferRequest` (OID4VCI), so we issue the
 * credential through the issuer API (signed with the company's own RSA private key) and
 * claim it into the wallet.
 *
 * Returns the wallet credential ID, or null on failure (non-fatal — credential is still valid).
 */
export async function storeVcInCompanyWalletViaOID4VCI(params: {
  companyId: string;
  companyDid: string;
  credentialPayload: Record<string, unknown>;
  credentialConfigurationId?: string;
}): Promise<string | null> {
  const ctx = await getCompanyWalletContext(params.companyId);
  if (!ctx) {
    logger.warn({ component: 'company-wallet', companyId: params.companyId }, 'No wallet context — skipping OID4VCI wallet store');
    return null;
  }

  const privateRsaJwk = await exportWalletPrivateJwk(ctx.session, ctx.walletId, ctx.rsaKeyId);
  if (!privateRsaJwk) {
    logger.warn({ component: 'company-wallet', companyId: params.companyId }, 'Could not export RSA private JWK — skipping OID4VCI wallet store');
    return null;
  }

  const issuerJwk = { ...privateRsaJwk, kid: `${params.companyDid}#key-rsa`, alg: 'RS256' };

  const result = await issueJwtVcViaIssuerAndClaim({
    session: ctx.session,
    walletId: ctx.walletId,
    issuerDid: params.companyDid,
    issuerPublicJwk: issuerJwk,
    credentialData: params.credentialPayload,
    credentialConfigurationId: params.credentialConfigurationId ?? WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID,
  });

  return result?.walletCredentialId ?? null;
}

export async function issueVcJwtForCompanyWithContext(
  ctx: CompanyWalletContext,
  companyDid: string,
  vcPayload: Record<string, unknown>,
  _rsaPublicJwk: Record<string, unknown>,
): Promise<IssuedWalletCredential | null> {
  const company = await prisma.company.findFirst({
    where: { did: companyDid },
    select: { rsaCertPem: true },
  });
  return signVcJwtWithWalletRsaKey({
    session: ctx.session,
    walletId: ctx.walletId,
    rsaKeyId: ctx.rsaKeyId,
    companyDid,
    vcPayload,
    rsaCertPem: company?.rsaCertPem,
  });
}

/**
 * Sign a Verifiable Presentation as a compact VP-JWT for Gaia-X compliance.
 *
 * The gx-compliance v2 endpoint expects:
 *   POST /api/credential-offers/standard-compliance?vcid={lpVcId}
 *   Content-Type: application/vp+jwt
 *   Body: compact VP-JWS string
 *
 * VP JWT header: typ=vp+jwt, cty=vp (matches VP_JWT_MIME_TYPE constant in gx-compliance).
 * Each VC is wrapped as EnvelopedVerifiableCredential with id=data:application/vc+jwt,{jwt}.
 * Reference: gx-compliance src/examples/signed-examples.ts STANDARD_COMPLIANCE_VP_JWT_EXAMPLE
 */
export async function signComplianceVpJwtForCompany(params: {
  companyId: string;
  companyDid: string;
  vcJwts: string[];
  audience?: string;
  vpDocumentId?: string;
}): Promise<string | null> {
  const ctx = await getCompanyWalletContext(params.companyId);
  if (!ctx) return null;

  const privatePem = await getCompanyPrivatePem(ctx.session, ctx.walletId, ctx.rsaKeyId);
  if (!privatePem) return null;

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { rsaCertPem: true },
  });

  const now = Math.floor(Date.now() / 1000);
  const kid = `${params.companyDid}#key-rsa`;

  // EnvelopedVerifiableCredential per VC Data Model 2.0 §4.13 + gx-compliance v2 example.
  const verifiableCredential = params.vcJwts.map((vcJwt) => ({
    '@context': 'https://www.w3.org/ns/credentials/v2',
    type: 'EnvelopedVerifiableCredential',
    id: `data:application/vc+jwt,${vcJwt}`,
  }));

  const payload: Record<string, unknown> = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiablePresentation'],
    issuer: params.companyDid,
    validFrom: new Date(now * 1000).toISOString(),
    validUntil: new Date((now + 3600) * 1000).toISOString(),
    verifiableCredential,
  };

  try {
    // VP JWT header: typ=vp+jwt, cty=vp (matches gx-compliance VP_JWT_MIME_TYPE/CTY constants).
    // No x5c — gx-compliance uses x5u from the DID doc's publicKeyJwk (avoids PEM line-break issue).
    const vpHeader: jwt.JwtHeader & { cty?: string; iss?: string } = {
      alg: 'RS256',
      typ: 'vp+jwt',
      cty: 'vp',
      kid,
      iss: params.companyDid,
    };
    return jwt.sign(payload, privatePem, { algorithm: 'RS256', header: vpHeader });
  } catch (e) {
    logger.warn({ component: 'company-wallet', err: (e as Error).message }, 'signComplianceVpJwtForCompany failed');
    return null;
  }
}
