import axios from 'axios';
import { NotaryResult, ComplianceResult, GaiaXEndpointSet } from './types';

/**
 * Client for real GXDCH v2 API surface.
 *
 * Notary: GET /registration-numbers/{type}/{id}?vcId={url}&subjectId={did}
 *   - Returns a signed VC-JWT attesting the registration number
 *
 * Compliance: POST /api/credential-offers/standard-compliance?vcid={url}
 *   - Content-Type: application/vnd.ietf.jose.presentation+jwt
 *   - Body: VP-JWT string
 *   - Returns: 201 with compliance credential JWT
 */
export class GaiaXLiveClient {
  private timeout: number;

  constructor(timeout = 15000) {
    this.timeout = timeout;
  }

  /**
   * Call the real GXDCH notary to verify a registration number.
   * This is a simple GET that validates the number against EU VIES (VAT),
   * EU Customs (EORI), GLEIF (LEI), or OpenCorporates (tax-id).
   */
  async verifyRegistrationNumber(
    notaryBaseUrl: string,
    type: 'vat-id' | 'eori' | 'lei-code' | 'tax-id',
    id: string,
    vcId: string,
    subjectDid: string,
  ): Promise<NotaryResult> {
    const url = `${notaryBaseUrl}/registration-numbers/${type}/${encodeURIComponent(id)}`;
    const start = Date.now();

    try {
      const response = await axios.get(url, {
        params: { vcId, subjectId: subjectDid },
        timeout: this.timeout,
        // The notary returns a VC-JWT with content-type application/vc+jwt
        headers: { Accept: 'application/vc+jwt, application/json' },
        // Accept any response format
        responseType: 'text',
        transformResponse: [(data: string) => data],
        validateStatus: (status: number) => status < 500,
      });

      const responseData = response.data;

      if (response.status >= 400) {
        const errorBody = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(errorBody); } catch { parsed = { raw: errorBody }; }
        return {
          status: 'error' as const,
          endpointSetUsed: notaryBaseUrl,
          timestamp: new Date().toISOString(),
          raw: { httpStatus: response.status, ...parsed, durationMs: Date.now() - start },
        };
      }

      const isJwt = typeof responseData === 'string' && responseData.split('.').length === 3;

      return {
        status: 'success',
        registrationId: `${type}:${id}`,
        registrationNumberVC: isJwt ? responseData : undefined,
        raw: isJwt ? { jwt: responseData.slice(0, 100) + '...' } : (typeof responseData === 'string' ? JSON.parse(responseData) : responseData),
        endpointSetUsed: notaryBaseUrl,
        timestamp: new Date().toISOString(),
      };
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: string }; message: string };
      return {
        status: 'error',
        endpointSetUsed: notaryBaseUrl,
        timestamp: new Date().toISOString(),
        raw: {
          error: err.message,
          httpStatus: err.response?.status,
          responseBody: err.response?.data?.slice?.(0, 500),
          durationMs: Date.now() - start,
        },
      };
    }
  }

  /**
   * Resolve which registration number type to use for notary verification.
   */
  getNotaryType(regNumbers: Record<string, string | undefined>): { type: 'vat-id' | 'eori' | 'lei-code' | 'tax-id'; value: string } | null {
    if (regNumbers.vatId) return { type: 'vat-id', value: regNumbers.vatId };
    if (regNumbers.eoriNumber) return { type: 'eori', value: regNumbers.eoriNumber };
    if (regNumbers.leiCode) return { type: 'lei-code', value: regNumbers.leiCode };
    if (regNumbers.taxId) return { type: 'tax-id', value: regNumbers.taxId };
    return null;
  }

  /**
   * Submit a VP-JWT to the real GXDCH compliance service.
   * Expects the VP to be signed with a key that has x5u/x5c certificate chain
   * rooted in a Gaia-X Trust Anchor. For demo purposes, we submit with a self-signed
   * key and capture the (expected) error response for transparency.
   */
  async submitCompliance(
    complianceBaseUrl: string,
    vpJwt: string,
    vcId: string,
  ): Promise<ComplianceResult> {
    const url = `${complianceBaseUrl}/api/credential-offers/standard-compliance`;
    const start = Date.now();

    try {
      const response = await axios.post(url, vpJwt, {
        params: { vcid: vcId },
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/vp+jwt',
          Accept: 'application/vc+jwt, application/json',
        },
        responseType: 'text',
        transformResponse: [(data) => data],
        // Don't throw on 4xx so we can capture the error body
        validateStatus: (status) => status < 500,
      });

      const isSuccess = response.status === 201 || response.status === 200;
      const responseData = response.data;
      const isJwt = typeof responseData === 'string' && responseData.split('.').length === 3;

      if (isSuccess) {
        return {
          status: 'compliant',
          complianceLevel: 'gx:BasicCompliance',
          issuedCredential: isJwt ? { jwt: responseData } : (parseJsonSafe(responseData) || undefined),
          endpointSetUsed: complianceBaseUrl,
          timestamp: new Date().toISOString(),
          raw: { status: response.status, durationMs: Date.now() - start },
        };
      }

      // 4xx error — capture the detailed error for demo display
      const errorBody = parseJsonSafe(responseData) as Record<string, unknown> | null;
      return {
        status: 'non-compliant' as const,
        errors: [
          String(errorBody?.message || `HTTP ${response.status}`),
          ...(Array.isArray(errorBody?.errors) ? (errorBody.errors as unknown[]).map((e: unknown) => String(e)) : []),
        ],
        endpointSetUsed: complianceBaseUrl,
        timestamp: new Date().toISOString(),
        raw: {
          httpStatus: response.status,
          body: errorBody as unknown,
          durationMs: Date.now() - start,
        },
      };
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: string }; message: string };
      return {
        status: 'error',
        errors: [err.message],
        endpointSetUsed: complianceBaseUrl,
        timestamp: new Date().toISOString(),
        raw: {
          error: err.message,
          httpStatus: err.response?.status,
          durationMs: Date.now() - start,
        },
      };
    }
  }

  /**
   * Check the registry trust anchor chain (informational).
   */
  async checkTrustAnchor(registryBaseUrl: string, certificate?: string): Promise<Record<string, unknown>> {
    try {
      if (certificate) {
        const response = await axios.post(`${registryBaseUrl}/api/trustAnchor/chain`, {
          certs: certificate,
        }, { timeout: this.timeout });
        return response.data;
      }
      // Just check if registry is alive
      const response = await axios.get(`${registryBaseUrl}/api/trustAnchor`, {
        timeout: this.timeout,
      });
      return { alive: true, data: response.data };
    } catch (e: unknown) {
      const err = e as Error;
      return { alive: false, error: err.message };
    }
  }
}

function parseJsonSafe(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
