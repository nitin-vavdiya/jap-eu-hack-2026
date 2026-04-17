import axios from 'axios';
import logger from '../../lib/logger';
import { WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID } from './waltid-oid4vci-defaults';

const WALTID_ISSUER_URL = process.env.WALTID_ISSUER_URL || 'http://localhost:7002';
const WALTID_VERIFIER_URL = process.env.WALTID_VERIFIER_URL || 'http://localhost:7003';

const issuerApi = axios.create({ baseURL: WALTID_ISSUER_URL, timeout: 10000 });

/**
 * Generic, key-less walt.id issuer/verifier helpers used by legacy non-Gaia-X routes
 * (manufacturer OwnershipVC mirror, insurance VC mirror, `/api/vc/issue` dev endpoint).
 *
 * These do NOT participate in the per-company wallet flow (see `company-wallet-service.ts`
 * for the Gaia-X ICAM compliant path). They exist for sandbox / demo mirroring only.
 *
 * NOTE: The walt.id issuer API actually requires `issuerKey` to sign — these fire-and-forget
 * calls from legacy routes will fail at the walt.id layer. Keeping the surface intact until
 * those call sites are either wired to proper per-wallet signing or removed.
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
    logger.warn({ component: 'walt-generic', err: (error as Error).message }, 'Simple issuance failed');
    return null;
  }
}

export async function verifyPresentationOID4VP(request: {
  presentationDefinition: Record<string, unknown>;
}) {
  try {
    const response = await axios.post(`${WALTID_VERIFIER_URL}/openid4vc/verify`, {
      request_credentials: [request.presentationDefinition],
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.warn({ component: 'walt-generic', err: (error as Error).message }, 'OID4VP verification failed');
    return null;
  }
}
