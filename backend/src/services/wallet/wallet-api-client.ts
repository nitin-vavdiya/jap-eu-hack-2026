import axios, { type AxiosInstance } from 'axios';
import logger from '../../lib/logger';

const DEFAULT_TIMEOUT_MS = 15000;

export const OPERATOR_ED25519_KEY_NAME = 'smartsense-operator-ed25519';
export const OPERATOR_RSA_KEY_NAME = 'smartsense-operator-rsa';

function createWalletAxios(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: Number(process.env.WALTID_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 300,
  });
}

export function getWalletApiBaseUrl(): string {
  return process.env.WALTID_WALLET_URL || 'http://localhost:7001';
}

export type WalletSession = {
  token: string;
  /** walt.id account id from login (UUID string) */
  accountId: string;
};

/**
 * Register an email/password wallet account (idempotent if caller handles "already exists").
 */
export async function walletRegister(params: {
  baseURL?: string;
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  await client.post('/wallet-api/auth/register', {
    type: 'email',
    name: params.name,
    email: params.email,
    password: params.password,
  });
}

export async function walletLogin(params: {
  baseURL?: string;
  email: string;
  password: string;
}): Promise<WalletSession> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  const { data } = await client.post<{
    token?: string;
    id?: string;
  }>('/wallet-api/auth/login', {
    type: 'email',
    email: params.email,
    password: params.password,
  });
  const token = typeof data === 'string' ? data : data?.token;
  const accountId = typeof data === 'object' && data && 'id' in data && data.id ? String(data.id) : '';
  if (!token || !accountId) {
    throw new Error('Wallet login response missing token or account id');
  }
  return { token, accountId };
}

export type AccountWalletsResponse = {
  account: string;
  wallets: Array<{ id: string; name?: string }>;
};

export async function fetchAccountWallets(session: WalletSession, baseURL?: string): Promise<AccountWalletsResponse> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  const { data } = await client.get<AccountWalletsResponse>('/wallet-api/wallet/accounts/wallets', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!data?.wallets?.length) {
    throw new Error('Wallet API returned no wallets for this account');
  }
  const account = data.account || session.accountId;
  return { account, wallets: data.wallets };
}

function normalizeKeyIdList(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.map((x) => (typeof x === 'string' ? x : String((x as { id?: string }).id ?? x))).filter(Boolean);
  }
  if (data && typeof data === 'object' && 'keys' in data && Array.isArray((data as { keys: unknown }).keys)) {
    return normalizeKeyIdList((data as { keys: unknown }).keys);
  }
  logger.warn({ component: 'wallet-api-client' }, 'Unexpected listKeys response shape');
  return [];
}

export async function listWalletKeyIds(
  session: WalletSession,
  walletId: string,
  baseURL?: string,
): Promise<string[]> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  const { data } = await client.get<unknown>(`/wallet-api/wallet/${walletId}/keys`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  return normalizeKeyIdList(data);
}

export async function getWalletKeyMeta(
  session: WalletSession,
  walletId: string,
  keyId: string,
  baseURL?: string,
): Promise<Record<string, unknown> | null> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  try {
    const { data } = await client.get<Record<string, unknown>>(`/wallet-api/wallet/${walletId}/keys/${keyId}/meta`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export async function exportWalletPublicJwk(
  session: WalletSession,
  walletId: string,
  keyId: string,
  baseURL?: string,
): Promise<Record<string, unknown> | null> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  try {
    const { data } = await client.get<Record<string, unknown>>(
      `/wallet-api/wallet/${walletId}/keys/${keyId}/export`,
      {
        params: { format: 'JWK', loadPrivateKey: false },
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Export a private key JWK from the wallet.
 * Used for local JWT signing where full header control is needed (e.g. Gaia-X iss header requirement).
 * The private key is held in memory transiently and never persisted.
 */
export async function exportWalletPrivateJwk(
  session: WalletSession,
  walletId: string,
  keyId: string,
  baseURL?: string,
): Promise<Record<string, unknown> | null> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  try {
    const { data } = await client.get<Record<string, unknown>>(
      `/wallet-api/wallet/${walletId}/keys/${keyId}/export`,
      {
        params: { format: 'JWK', loadPrivateKey: true },
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Claim an OID4VCI credential offer into the wallet (POST body = offer URI string per walt.id tutorial).
 */
export async function claimCredentialOffer(params: {
  session: WalletSession;
  walletId: string;
  credentialOfferUri: string;
  baseURL?: string;
}): Promise<void> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  await client.post(
    `/wallet-api/wallet/${params.walletId}/exchange/useOfferRequest`,
    params.credentialOfferUri,
    {
      headers: {
        Authorization: `Bearer ${params.session.token}`,
        'Content-Type': 'text/plain',
      },
    },
  );
}

export async function listWalletCredentials(
  session: WalletSession,
  walletId: string,
  baseURL?: string,
): Promise<Record<string, unknown>[]> {
  const client = createWalletAxios(baseURL ?? getWalletApiBaseUrl());
  const { data } = await client.get<unknown>(`/wallet-api/wallet/${walletId}/credentials`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

/**
 * Sign an arbitrary JSON payload as a JWT using a wallet-held key (EdDSA or RS256 depending on key).
 * @see https://docs.walt.id/community-stack/wallet/key-management/message-signing
 */
export async function signJsonWithWalletKey(params: {
  session: WalletSession;
  walletId: string;
  keyId: string;
  payload: Record<string, unknown>;
  baseURL?: string;
}): Promise<string> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  const { data } = await client.post<unknown>(
    `/wallet-api/wallet/${params.walletId}/keys/${params.keyId}/sign`,
    params.payload,
    { headers: { Authorization: `Bearer ${params.session.token}`, 'Content-Type': 'application/json' } },
  );
  if (typeof data !== 'string') {
    throw new Error('Wallet key sign did not return a JWT string');
  }
  return data;
}

/**
 * Import a self-signed VC JWT directly into the wallet (no OID4VCI round-trip needed).
 * Used for self-attested credentials like LegalParticipant VC.
 * @see https://docs.walt.id/community-stack/wallet/credential-exchange/guides/import-w3c-vc
 */
export async function importCredentialToWallet(params: {
  session: WalletSession;
  walletId: string;
  jwt: string;
  associatedDid: string;
  baseURL?: string;
}): Promise<string | null> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  try {
    const { data } = await client.post<unknown>(
      `/wallet-api/wallet/${params.walletId}/credentials/import`,
      { jwt: params.jwt, associated_did: params.associatedDid },
      {
        headers: {
          Authorization: `Bearer ${params.session.token}`,
          'Content-Type': 'application/json',
        },
        validateStatus: (s) => s === 201 || s === 409,
      },
    );
    if (data && typeof data === 'object' && 'id' in data) return String((data as { id: string }).id);
    if (typeof data === 'string') return data;
    return params.associatedDid;
  } catch (e) {
    logger.warn({ component: 'wallet-api-client', err: (e as Error).message }, 'importCredentialToWallet failed');
    return null;
  }
}

export async function generateWalletKey(params: {
  session: WalletSession;
  walletId: string;
  keyType: 'Ed25519' | 'RSA';
  name: string;
  baseURL?: string;
}): Promise<string> {
  const client = createWalletAxios(params.baseURL ?? getWalletApiBaseUrl());
  const { status, data } = await client.post<unknown>(
    `/wallet-api/wallet/${params.walletId}/keys/generate`,
    {
      backend: 'jwk',
      keyType: params.keyType,
      name: params.name,
    },
    { headers: { Authorization: `Bearer ${params.session.token}` } },
  );
  if (status !== 201) {
    throw new Error(`Key generate failed with HTTP ${status}`);
  }
  if (typeof data === 'string') {
    return data.replace(/^"|"$/g, '').trim();
  }
  if (data && typeof data === 'object' && 'id' in data) {
    return String((data as { id: string }).id);
  }
  throw new Error('Key generate response was not a key id string');
}
