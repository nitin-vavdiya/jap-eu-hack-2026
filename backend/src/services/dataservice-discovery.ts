/**
 * DataService Discovery
 * Parses the DataService entry from an issuer DID document to extract
 * the provider's DSP URL and BPNL for EDC sovereign data exchange.
 *
 * DID Document service entry format:
 * {
 *   "id": "<issuer-did>#data-service",
 *   "type": "DataService",
 *   "serviceEndpoint": "<DSP_URL>#<BPNL>"
 * }
 */

import type { DidDocument, ServiceEndpoint } from './did-resolver';

export interface DataServiceDiscoveryResult {
  dspUrl: string;
  issuerBpnl: string;
  serviceEndpoint: string;
  serviceId: string;
}

export class DataServiceDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_DATASERVICE'
      | 'MALFORMED_ENDPOINT'
      | 'MISSING_FRAGMENT'
      | 'INVALID_BPNL'
      | 'INVALID_DSP_URL',
    public readonly did?: string,
  ) {
    super(message);
    this.name = 'DataServiceDiscoveryError';
  }
}

const BPNL_PATTERN = /^BPNL[A-Z0-9]{12}$/i;

/**
 * Discover provider DSP URL and BPNL from an issuer DID document.
 * Looks for a service entry with type "DataService" and parses
 * the serviceEndpoint as "<DSP_URL>#<BPNL>".
 */
export function discoverDataService(
  didDocument: DidDocument,
): DataServiceDiscoveryResult {
  const services = (didDocument.service || []).filter(
    (s) => s.type === 'DataService',
  );

  if (services.length === 0) {
    throw new DataServiceDiscoveryError(
      `No DataService entry found in DID document for ${didDocument.id}. ` +
        `Expected a service with type "DataService" containing the provider DSP URL and BPNL.`,
      'NO_DATASERVICE',
      didDocument.id,
    );
  }

  if (services.length > 1) {
    console.warn(
      `[DataService Discovery] Multiple DataService entries found in DID ${didDocument.id}. Using first entry: ${services[0].id}`,
    );
  }

  const service = services[0];
  return parseDataServiceEndpoint(service, didDocument.id);
}

/**
 * Parse a DataService endpoint string into DSP URL and BPNL.
 * Format: "<DSP_URL>#<BPNL>"
 */
export function parseDataServiceEndpoint(
  service: ServiceEndpoint,
  did?: string,
): DataServiceDiscoveryResult {
  const raw = service.serviceEndpoint;

  if (!raw || typeof raw !== 'string') {
    throw new DataServiceDiscoveryError(
      `DataService endpoint is empty or not a string in DID ${did || 'unknown'}`,
      'MALFORMED_ENDPOINT',
      did,
    );
  }

  const hashIndex = raw.indexOf('#');
  if (hashIndex === -1) {
    throw new DataServiceDiscoveryError(
      `DataService endpoint "${raw}" is missing the fragment separator (#). ` +
        `Expected format: "<DSP_URL>#<BPNL>"`,
      'MISSING_FRAGMENT',
      did,
    );
  }

  const dspUrl = raw.substring(0, hashIndex);
  const issuerBpnl = raw.substring(hashIndex + 1);

  // Validate DSP URL
  if (!dspUrl || dspUrl.length < 10) {
    throw new DataServiceDiscoveryError(
      `DSP URL "${dspUrl}" extracted from DataService endpoint is invalid or too short`,
      'INVALID_DSP_URL',
      did,
    );
  }

  try {
    new URL(dspUrl);
  } catch {
    throw new DataServiceDiscoveryError(
      `DSP URL "${dspUrl}" extracted from DataService endpoint is not a valid URL`,
      'INVALID_DSP_URL',
      did,
    );
  }

  // Validate BPNL
  if (!issuerBpnl) {
    throw new DataServiceDiscoveryError(
      `BPNL is empty after fragment separator in DataService endpoint "${raw}"`,
      'INVALID_BPNL',
      did,
    );
  }

  if (!BPNL_PATTERN.test(issuerBpnl)) {
    throw new DataServiceDiscoveryError(
      `BPNL "${issuerBpnl}" does not match expected format BPNL + 12 alphanumeric chars (pattern: ${BPNL_PATTERN})`,
      'INVALID_BPNL',
      did,
    );
  }

  return {
    dspUrl,
    issuerBpnl,
    serviceEndpoint: raw,
    serviceId: service.id,
  };
}
