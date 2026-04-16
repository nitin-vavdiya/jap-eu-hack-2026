import axios from 'axios';
import logger from '../../lib/logger';
import {
  claimCredentialOffer,
  getWalletApiBaseUrl,
  listWalletCredentials,
  type WalletSession,
} from './wallet-api-client';
import { WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID } from './waltid-oid4vci-defaults';

const WALTID_ISSUER_URL = process.env.WALTID_ISSUER_URL || 'http://localhost:7002';

export type IssuedWalletCredential = {
  jwt: string;
  /** walt.id wallet credential id (e.g. urn:uuid:...) */
  walletCredentialId: string;
};

function extractFromCredentialRow(row: Record<string, unknown>): { jwt: string | null; walletCredentialId: string | null } {
  const walletCredentialId = row.id != null ? String(row.id) : null;
  const doc = row.document;
  if (typeof doc === 'string' && doc.split('.').length === 3) {
    return { jwt: doc, walletCredentialId };
  }
  const parsed = row.parsedDocument;
  if (parsed && typeof parsed === 'object' && '_jwt' in parsed && typeof (parsed as { _jwt: unknown })._jwt === 'string') {
    return { jwt: (parsed as { _jwt: string })._jwt, walletCredentialId };
  }
  return { jwt: null, walletCredentialId };
}

/**
 * OID4VCI offer + claim; returns VC-JWT and wallet credential id (no DB persistence of JWT).
 */
export async function issueJwtVcViaIssuerAndClaim(params: {
  session: WalletSession;
  walletId: string;
  issuerDid: string;
  issuerPublicJwk: Record<string, unknown>;
  credentialData: Record<string, unknown>;
  credentialConfigurationId?: string;
}): Promise<IssuedWalletCredential | null> {
  const walletBase = getWalletApiBaseUrl();
  try {
    const issueResp = await axios.post(
      `${WALTID_ISSUER_URL}/openid4vc/jwt/issue`,
      {
        issuerKey: { type: 'jwk', jwk: params.issuerPublicJwk },
        issuerDid: params.issuerDid,
        credentialConfigurationId: params.credentialConfigurationId || WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID,
        credentialData: params.credentialData,
      },
      {
        timeout: 20000,
        responseType: 'text',
        transformResponse: [(body) => body],
        headers: { Accept: 'text/plain, application/json', 'Content-Type': 'application/json' },
        validateStatus: (s) => s >= 200 && s < 300,
      },
    );
    const offerUri = String(issueResp.data).trim().replace(/^"|"$/g, '');
    if (!offerUri.startsWith('openid-credential-offer://')) {
      logger.warn({ component: 'walt-oid4vci', preview: offerUri.slice(0, 80) }, 'Issuer did not return credential offer URI');
      return null;
    }

    const before = await listWalletCredentials(params.session, params.walletId, walletBase);
    const beforeIds = new Set(before.map((c) => String(c.id || c)));

    await claimCredentialOffer({
      session: params.session,
      walletId: params.walletId,
      credentialOfferUri: offerUri,
      baseURL: walletBase,
    });

    const after = await listWalletCredentials(params.session, params.walletId, walletBase);
    for (let i = after.length - 1; i >= 0; i--) {
      const row = after[i];
      const id = String(row.id || '');
      if (beforeIds.has(id)) continue;
      const { jwt, walletCredentialId } = extractFromCredentialRow(row);
      if (jwt && walletCredentialId) return { jwt, walletCredentialId };
    }
    const last = after[after.length - 1];
    if (last) {
      const { jwt, walletCredentialId } = extractFromCredentialRow(last);
      if (jwt && walletCredentialId) return { jwt, walletCredentialId };
    }
    return null;
  } catch (e) {
    logger.warn({ component: 'walt-oid4vci', err: (e as Error).message }, 'issueJwtVcViaIssuerAndClaim failed');
    return null;
  }
}
