import prisma from '../../db';
import logger from '../../lib/logger';
import { isVaultKvConfigured, vaultKvWriteJson } from '../vault/vault-kv';
import {
  exportWalletPrivateJwk,
  exportWalletPublicJwk,
  fetchAccountWallets,
  generateWalletKey,
  getWalletApiBaseUrl,
  getWalletKeyMeta,
  listWalletKeyIds,
  walletLogin,
  walletRegister,
  type WalletSession,
} from './wallet-api-client';
import { generateSelfSignedCert } from './x5c-utils';
import { createPrivateKey } from 'crypto';

export const COMPANY_ED25519_KEY_NAME = 'smartsense-company-ed25519';
export const COMPANY_RSA_KEY_NAME = 'smartsense-company-rsa';

function isEd25519Jwk(jwk: Record<string, unknown>): boolean {
  return jwk.kty === 'OKP' && jwk.crv === 'Ed25519';
}

function isRsaJwk(jwk: Record<string, unknown>): boolean {
  return jwk.kty === 'RSA';
}

async function resolveCompanyKeyIds(params: {
  session: WalletSession;
  walletId: string;
  baseURL: string;
}): Promise<{ ed25519KeyId: string; rsaKeyId: string }> {
  const { session, walletId, baseURL } = params;
  const keyIds = await listWalletKeyIds(session, walletId, baseURL);

  let byNameEd: string | undefined;
  let byNameRsa: string | undefined;
  let byJwkEd: string | undefined;
  let byJwkRsa: string | undefined;

  for (const keyId of keyIds) {
    const meta = await getWalletKeyMeta(session, walletId, keyId, baseURL);
    const name = meta && typeof meta.name === 'string' ? meta.name : undefined;
    if (name === COMPANY_ED25519_KEY_NAME) byNameEd = keyId;
    if (name === COMPANY_RSA_KEY_NAME) byNameRsa = keyId;
  }

  if (!byNameEd || !byNameRsa) {
    for (const keyId of keyIds) {
      const jwk = await exportWalletPublicJwk(session, walletId, keyId, baseURL);
      if (!jwk) continue;
      if (!byJwkEd && isEd25519Jwk(jwk)) byJwkEd = keyId;
      if (!byJwkRsa && isRsaJwk(jwk)) byJwkRsa = keyId;
    }
  }

  let ed25519KeyId = byNameEd ?? byJwkEd;
  let rsaKeyId = byNameRsa ?? byJwkRsa;

  if (!ed25519KeyId) {
    ed25519KeyId = await generateWalletKey({
      session,
      walletId,
      keyType: 'Ed25519',
      name: COMPANY_ED25519_KEY_NAME,
      baseURL,
    });
  }
  if (!rsaKeyId) {
    rsaKeyId = await generateWalletKey({
      session,
      walletId,
      keyType: 'RSA',
      name: COMPANY_RSA_KEY_NAME,
      baseURL,
    });
  }

  return { ed25519KeyId, rsaKeyId };
}

async function ensureCompanySession(params: {
  email: string;
  password: string;
  displayName: string;
  baseURL: string;
}): Promise<WalletSession> {
  const { email, password, displayName, baseURL } = params;
  try {
    return await walletLogin({ email, password, baseURL });
  } catch {
    await walletRegister({ name: displayName, email, password, baseURL }).catch(() => {});
    return walletLogin({ email, password, baseURL });
  }
}

export type CompanyWalletProvisionResult = {
  walletAccountId: string;
  walletId: string;
  ed25519KeyId: string;
  rsaKeyId: string;
  ed25519PublicJwk: Record<string, unknown>;
  rsaPublicJwk: Record<string, unknown>;
  /** Self-signed X.509 cert PEM for the RSA key — embedded as x5c in DID doc and JWT headers for Gaia-X compliance. */
  rsaCertPem: string | null;
  accountEmail: string;
  accountPassword: string;
};

/**
 * Create walt.id account `company-{id}@wallet.internal`, wallet, Ed25519+RSA keys, export public JWKs.
 */
export async function provisionCompanyWaltWallet(params: {
  companyId: string;
  companyName: string;
  accountPassword: string;
  baseURL?: string;
}): Promise<CompanyWalletProvisionResult> {
  const baseURL = params.baseURL ?? getWalletApiBaseUrl();
  const accountEmail = `company-${params.companyId}@wallet.internal`;
  const displayName = `${params.companyName} Wallet`.slice(0, 120);

  const session = await ensureCompanySession({
    email: accountEmail,
    password: params.accountPassword,
    displayName,
    baseURL,
  });

  const { account, wallets } = await fetchAccountWallets(session, baseURL);
  const walletId = wallets[0].id;
  const { ed25519KeyId, rsaKeyId } = await resolveCompanyKeyIds({ session, walletId, baseURL });

  const ed25519PublicJwk = (await exportWalletPublicJwk(session, walletId, ed25519KeyId, baseURL)) || {};
  const rsaPublicJwk = (await exportWalletPublicJwk(session, walletId, rsaKeyId, baseURL)) || {};

  // Generate self-signed X.509 cert for x5c — required by Gaia-X compliance to validate the DID document.
  // We export the private key transiently here (never persisted — only the cert PEM is stored).
  let rsaCertPem: string | null = null;
  try {
    const privateJwk = await exportWalletPrivateJwk(session, walletId, rsaKeyId, baseURL);
    if (privateJwk && rsaPublicJwk.kty) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const privateKeyObj = createPrivateKey({ key: privateJwk as any, format: 'jwk' });
      const privateKeyPem = privateKeyObj.export({ format: 'pem', type: 'pkcs8' }) as string;
      const publicKeyPem = (await import('crypto')).createPublicKey({ key: rsaPublicJwk as any, format: 'jwk' }).export({ format: 'pem', type: 'spki' }) as string;
      rsaCertPem = generateSelfSignedCert(privateKeyPem, publicKeyPem)?.pem ?? null;
    }
  } catch (e) {
    logger.warn({ component: 'company-wallet-provisioning', err: (e as Error).message }, 'Failed to generate RSA self-signed cert — x5c will be missing from DID document');
  }

  return {
    walletAccountId: account,
    walletId,
    ed25519KeyId,
    rsaKeyId,
    ed25519PublicJwk,
    rsaPublicJwk,
    rsaCertPem,
    accountEmail,
    accountPassword: params.accountPassword,
  };
}

/**
 * Persist company wallet row + Vault secret (required for first deploy — async Gaia-X must log in later).
 */
export async function persistCompanyWalletProvision(
  companyId: string,
  result: CompanyWalletProvisionResult,
): Promise<void> {
  if (!isVaultKvConfigured()) {
    throw new Error(
      'HashiCorp Vault is required to store company wallet credentials: set VAULT_ADDR and VAULT_TOKEN. ' +
        'For local development run `docker compose up vault` and use http://127.0.0.1:8200 with the root token from docker-compose.yml (see backend/.env.example).',
    );
  }

  const vaultPath = `company/${companyId}/wallet`;
  const written = await vaultKvWriteJson(vaultPath, {
    accountEmail: result.accountEmail,
    accountPassword: result.accountPassword,
    walletId: result.walletId,
    walletAccountId: result.walletAccountId,
    ed25519KeyId: result.ed25519KeyId,
    rsaKeyId: result.rsaKeyId,
  });
  if (!written) {
    throw new Error('Vault KV write failed for company wallet secret');
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      walletAccountId: result.walletAccountId,
      walletId: result.walletId,
      ed25519KeyId: result.ed25519KeyId,
      rsaKeyId: result.rsaKeyId,
      ed25519PublicJwk: result.ed25519PublicJwk as object,
      rsaPublicJwk: result.rsaPublicJwk as object,
      rsaCertPem: result.rsaCertPem,
      walletProvisioned: true,
    },
  });
}
