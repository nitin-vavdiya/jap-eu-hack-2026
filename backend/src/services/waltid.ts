import axios from 'axios';
import logger from '../lib/logger';
import { WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID } from './wallet/waltid-oid4vci-defaults';

const WALTID_ISSUER_URL = process.env.WALTID_ISSUER_URL || 'http://localhost:7002';
const WALTID_WALLET_URL = process.env.WALTID_WALLET_URL || 'http://localhost:7001';
const WALTID_VERIFIER_URL = process.env.WALTID_VERIFIER_URL || 'http://localhost:7003';

const issuerApi = axios.create({ baseURL: WALTID_ISSUER_URL, timeout: 10000 });
const walletApi = axios.create({ baseURL: WALTID_WALLET_URL, timeout: 10000 });

/**
 * Issue a Verifiable Credential via walt.id issuer-api OID4VCI flow.
 * Returns a credential offer URI that can be claimed by a wallet.
 */
export async function issueCredentialOID4VCI(params: {
  issuerDid: string;
  issuerKey: Record<string, unknown>;
  credentialConfigurationId: string;
  credentialData: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const response = await issuerApi.post('/openid4vc/jwt/issue', {
      issuerKey: { type: 'jwk', jwk: params.issuerKey },
      issuerDid: params.issuerDid,
      credentialConfigurationId: params.credentialConfigurationId,
      credentialData: params.credentialData,
    });
    return response.data; // credential offer URI
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'OID4VCI issuance failed');
    return null;
  }
}

/**
 * Issue a VC directly via the walt.id sdjwt/sign endpoint.
 * This is simpler than the full OID4VCI flow — returns the signed JWT directly.
 */
export async function issueCredentialDirect(params: {
  issuerDid: string;
  issuerKey: Record<string, unknown>;
  subjectDid: string;
  type: string[];
  credentialSubject: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const response = await issuerApi.post('/openid4vc/jwt/issue', {
      issuerKey: { type: 'jwk', jwk: params.issuerKey },
      issuerDid: params.issuerDid,
      credentialConfigurationId: WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID,
      credentialData: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: params.type,
        issuer: { id: params.issuerDid },
        credentialSubject: {
          id: params.subjectDid,
          ...params.credentialSubject,
        },
      },
    });
    return response.data; // credential offer URI
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'Direct issuance failed');
    return null;
  }
}

/**
 * Simple wrapper for legacy callers that don't have an issuerKey.
 * Uses {@link WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID} with arbitrary credential data until schemas are fixed.
 */
export async function issueCredentialSimple(params: {
  type: string;
  issuerDid: string;
  subjectDid: string;
  credentialSubject: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const response = await issuerApi.post('/openid4vc/jwt/issue', {
      issuerDid: params.issuerDid,
      credentialConfigurationId: WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID,
      credentialData: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', params.type],
        issuer: { id: params.issuerDid },
        credentialSubject: {
          id: params.subjectDid,
          ...params.credentialSubject,
        },
      },
    });
    return response.data;
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'Simple issuance failed');
    return null;
  }
}

// ─── Wallet API ───────────────────────────────────────────────

let _walletToken: string | null = null;
let _walletAccountId: string | null = null;

/**
 * Ensure a wallet account exists for the demo. Creates one if needed.
 */
export async function ensureWalletAccount(): Promise<{ token: string; accountId: string } | null> {
  if (_walletToken && _walletAccountId) {
    return { token: _walletToken, accountId: _walletAccountId };
  }

  const email = 'demo@smartsense-loire.io';
  const password = 'demo-wallet-pass-2026';

  try {
    // Try to login first
    const loginResp = await walletApi.post('/wallet-api/auth/login', {
      email, password, type: 'email',
    });
    _walletToken = loginResp.data.token || loginResp.data;
    _walletAccountId = loginResp.data.id || 'default';
    return { token: _walletToken!, accountId: _walletAccountId! };
  } catch {
    // Register if login fails
    try {
      await walletApi.post('/wallet-api/auth/register', {
        name: 'SmartSense Loire Demo',
        email, password, type: 'email',
      });
      const loginResp = await walletApi.post('/wallet-api/auth/login', {
        email, password, type: 'email',
      });
      _walletToken = loginResp.data.token || loginResp.data;
      _walletAccountId = loginResp.data.id || 'default';
      return { token: _walletToken!, accountId: _walletAccountId! };
    } catch (error) {
      logger.warn({ component: 'waltid', err: (error as Error).message }, 'Wallet account creation failed');
      return null;
    }
  }
}

/**
 * Get available wallets for the demo account.
 */
export async function getWallets(): Promise<Record<string, unknown>[] | null> {
  const account = await ensureWalletAccount();
  if (!account) return null;

  try {
    const response = await walletApi.get('/wallet-api/wallet/accounts/wallets', {
      headers: { Authorization: `Bearer ${account.token}` },
    });
    return response.data.wallets || response.data;
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'Failed to get wallets');
    return null;
  }
}

/**
 * Store a credential (offer URI or raw data) in the walt.id wallet.
 */
export async function storeCredentialInWallet(credentialOfferUri: string): Promise<boolean> {
  const account = await ensureWalletAccount();
  if (!account) return false;

  try {
    const wallets = await getWallets();
    const walletId = wallets?.[0]?.id || 'default';

    await walletApi.post(`/wallet-api/wallet/${walletId}/exchange/useOfferRequest`, null, {
      params: { offerUrl: credentialOfferUri },
      headers: { Authorization: `Bearer ${account.token}` },
    });
    return true;
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'Failed to store credential in wallet');
    return false;
  }
}

/**
 * List credentials in the walt.id wallet.
 */
export async function listWalletCredentials(): Promise<Record<string, unknown>[] | null> {
  const account = await ensureWalletAccount();
  if (!account) return null;

  try {
    const wallets = await getWallets();
    const walletId = wallets?.[0]?.id || 'default';

    const response = await walletApi.get(`/wallet-api/wallet/${walletId}/credentials`, {
      headers: { Authorization: `Bearer ${account.token}` },
    });
    return response.data;
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'Failed to list wallet credentials');
    return null;
  }
}

// ─── Verification (OID4VP) ────────────────────────────────────

export async function verifyPresentationOID4VP(request: {
  presentationDefinition: Record<string, unknown>;
}) {
  try {
    const response = await axios.post(`${WALTID_VERIFIER_URL}/openid4vc/verify`, {
      request_credentials: [request.presentationDefinition],
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.warn({ component: 'waltid', err: (error as Error).message }, 'OID4VP verification failed');
    return null;
  }
}
