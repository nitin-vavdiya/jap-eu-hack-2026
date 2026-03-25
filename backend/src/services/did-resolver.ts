/**
 * DID Resolution & Service Endpoint Discovery
 *
 * Resolves did:web, did:eu-dataspace, and did:smartsense DIDs to DID documents.
 * Company DID documents are built dynamically from the database — no hardcoding.
 *
 * did:web DIDs are hosted at /company/<companyId>/did.json and automatically
 * include the DataService endpoint once EDC provisioning completes.
 * The platform's Gaia-X keypair is used as a custodial key for all company DIDs.
 */

import prisma from '../db';
import { getVPSigner } from './gaiax/vp-signer';

const REGISTRY_BASE = process.env.APP_BASE_URL || 'http://localhost:8000';
const DID_DOMAIN = process.env.GAIAX_DID_DOMAIN || 'localhost%3A8000';

// --------------- Types ---------------

export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: Record<string, unknown>;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
  description?: string;
}

export interface DidResolutionResult {
  didDocument: DidDocument | null;
  didResolutionMetadata: { error?: string; contentType?: string };
  didDocumentMetadata: { created?: string; updated?: string };
}

// --------------- Service Type Constants ---------------

export const SERVICE_TYPES = {
  VEHICLE_REGISTRY: 'VehicleRegistryService',
  VEHICLE_DPP: 'VehicleDPPService',
  VEHICLE_INSURANCE_DATA: 'VehicleInsuranceDataService',
  VEHICLE_CREDENTIALS: 'VehicleCredentialService',
  VP_VERIFICATION: 'VPVerificationService',
  DATA_SERVICE: 'DataService',
} as const;

// --------------- Helpers ---------------

/** Build a did:web identifier for a company. */
export function buildCompanyDidWeb(companyId: string): string {
  return `did:web:${DID_DOMAIN}:company:${companyId}`;
}

/**
 * Build a DID document for a company from its DB record.
 * Dynamically includes DataService if EDC provisioning is ready.
 */
export function buildCompanyDidDocument(
  company: { id: string; did: string | null; bpn: string | null; name: string; createdAt: Date },
  edcProvisioning: { status: string; protocolUrl: string | null } | null,
): DidDocument {
  const did = company.did || buildCompanyDidWeb(company.id);
  const keyId = `${did}#key-1`;

  const signer = getVPSigner();

  const services: ServiceEndpoint[] = [];

  // Add DataService endpoint if EDC is provisioned and ready
  if (edcProvisioning?.status === 'ready' && edcProvisioning.protocolUrl && company.bpn) {
    services.push({
      id: `${did}#data-service`,
      type: SERVICE_TYPES.DATA_SERVICE,
      serviceEndpoint: edcProvisioning.protocolUrl.includes('#')
        ? edcProvisioning.protocolUrl
        : `${edcProvisioning.protocolUrl}#${company.bpn}`,
      description: 'IDSA Dataspace Protocol endpoint for sovereign data exchange',
    });
  }

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: signer.getPublicKeyJwk(),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: services.length > 0 ? services : undefined,
  };
}

function buildUserDidDocument(userId: string): DidDocument {
  const did = `did:smartsense:${userId}`;
  const keyId = `${did}#key-1`;
  const signer = getVPSigner();

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: signer.getPublicKeyJwk(),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: [],
  };
}

// --------------- DID Resolution ---------------

/**
 * Resolve a DID to a DID document.
 * For did:web company DIDs — queries the database and builds the document dynamically.
 * For did:smartsense user DIDs — builds a minimal document.
 */
export async function resolveDid(did: string): Promise<DidResolutionResult> {
  // Handle did:web company DIDs and legacy did:eu-dataspace company DIDs
  const company = await prisma.company.findFirst({
    where: { did },
    include: { edcProvisioning: true },
  });

  if (company) {
    return {
      didDocument: buildCompanyDidDocument(
        company,
        company.edcProvisioning,
      ),
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocumentMetadata: {
        created: company.createdAt.toISOString(),
        updated: company.updatedAt.toISOString(),
      },
    };
  }

  // Handle user DIDs (did:smartsense:*)
  if (did.startsWith('did:smartsense:')) {
    const userId = did.replace('did:smartsense:', '');
    return {
      didDocument: buildUserDidDocument(userId),
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocumentMetadata: { created: '2024-01-01T00:00:00Z', updated: new Date().toISOString() },
    };
  }

  return {
    didDocument: null,
    didResolutionMetadata: { error: 'notFound' },
    didDocumentMetadata: {},
  };
}

// --------------- Service Endpoint Discovery ---------------

export function getServiceEndpoints(didDocument: DidDocument): ServiceEndpoint[] {
  return didDocument.service || [];
}

export function selectEndpoint(
  didDocument: DidDocument,
  serviceType: string,
): ServiceEndpoint | null {
  const services = didDocument.service || [];
  return services.find(s => s.type === serviceType) || null;
}

export function resolveEndpointUrl(
  endpoint: ServiceEndpoint,
  params: Record<string, string>,
): string {
  let url = endpoint.serviceEndpoint;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, encodeURIComponent(value));
  }
  return url;
}
