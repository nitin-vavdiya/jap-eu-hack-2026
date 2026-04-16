import logger from '../../lib/logger';
import {
  OPERATOR_ED25519_KEY_NAME,
  OPERATOR_RSA_KEY_NAME,
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

export type OperatorWalletProvisionResult = {
  walletAccountId: string;
  walletId: string;
  ed25519KeyId: string;
  rsaKeyId: string;
  ed25519PublicJwk: Record<string, unknown>;
  rsaPublicJwk: Record<string, unknown>;
};

function isEd25519Jwk(jwk: Record<string, unknown>): boolean {
  return jwk.kty === 'OKP' && jwk.crv === 'Ed25519';
}

function isRsaJwk(jwk: Record<string, unknown>): boolean {
  return jwk.kty === 'RSA';
}

async function resolveKeyIds(params: {
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
    if (name === OPERATOR_ED25519_KEY_NAME) byNameEd = keyId;
    if (name === OPERATOR_RSA_KEY_NAME) byNameRsa = keyId;
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
      name: OPERATOR_ED25519_KEY_NAME,
      baseURL,
    });
    logger.info({ component: 'operator-wallet', keyId: ed25519KeyId }, 'Generated operator Ed25519 key in walt.id');
  }
  if (!rsaKeyId) {
    rsaKeyId = await generateWalletKey({
      session,
      walletId,
      keyType: 'RSA',
      name: OPERATOR_RSA_KEY_NAME,
      baseURL,
    });
    logger.info({ component: 'operator-wallet', keyId: rsaKeyId }, 'Generated operator RSA key in walt.id');
  }

  return { ed25519KeyId, rsaKeyId };
}

async function ensureWalletSession(params: {
  email: string;
  password: string;
  displayName: string;
  baseURL: string;
}): Promise<WalletSession> {
  const { email, password, displayName, baseURL } = params;
  try {
    return await walletLogin({ email, password, baseURL });
  } catch {
    logger.info({ component: 'operator-wallet', email }, 'Operator wallet login failed — attempting register');
    try {
      await walletRegister({ name: displayName, email, password, baseURL });
    } catch (regErr) {
      const msg = (regErr as Error).message || String(regErr);
      logger.warn({ component: 'operator-wallet', err: msg }, 'Operator wallet register failed (may already exist)');
    }
    return walletLogin({ email, password, baseURL });
  }
}

/**
 * Creates or reuses the operator walt.id account, default wallet, and Ed25519 + RSA keys.
 * Private keys never leave walt.id; this returns identifiers only.
 */
export async function provisionOperatorWallet(params: {
  email: string;
  password: string;
  displayName?: string;
  baseURL?: string;
}): Promise<OperatorWalletProvisionResult> {
  const baseURL = params.baseURL ?? getWalletApiBaseUrl();
  const displayName = params.displayName ?? 'SmartSense Operator';

  const session = await ensureWalletSession({
    email: params.email,
    password: params.password,
    displayName,
    baseURL,
  });

  const { account, wallets } = await fetchAccountWallets(session, baseURL);
  const walletId = wallets[0].id;

  const { ed25519KeyId, rsaKeyId } = await resolveKeyIds({ session, walletId, baseURL });

  const ed25519PublicJwk = (await exportWalletPublicJwk(session, walletId, ed25519KeyId, baseURL)) || {};
  const rsaPublicJwk = (await exportWalletPublicJwk(session, walletId, rsaKeyId, baseURL)) || {};

  return {
    walletAccountId: account,
    walletId,
    ed25519KeyId,
    rsaKeyId,
    ed25519PublicJwk,
    rsaPublicJwk,
  };
}
