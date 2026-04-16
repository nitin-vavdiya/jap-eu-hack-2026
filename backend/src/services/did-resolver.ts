/**
 * DID Resolution & Service Endpoint Discovery
 *
 * Resolves did:web, did:eu-dataspace, and did:smartsense DIDs to DID documents.
 * Company DID documents are built dynamically from the database — no hardcoding.
 *
 * Company verification methods always use cached walt.id JWKs (`#key-ed25519`,
 * `#key-rsa`) after onboarding. There is no legacy custodial key path.
 */

import prisma from '../db';
import { getSmartsenseHolderPublicKeyJwk } from './vp-processor';
import { certPemToX5cValue } from './wallet/x5c-utils';

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

/** Thrown when a company row exists but the walt.id wallet / JWKs are not ready. */
export class CompanyWalletNotProvisionedError extends Error {
  readonly companyId: string;

  constructor(companyId: string) {
    super(`Company wallet not provisioned (missing JWKs or wallet flag): ${companyId}`);
    this.name = 'CompanyWalletNotProvisionedError';
    this.companyId = companyId;
  }
}

export type CompanyDidSource = {
  id: string;
  did: string | null;
  bpn: string | null;
  name: string;
  createdAt: Date;
  updatedAt?: Date;
  walletProvisioned?: boolean;
  ed25519PublicJwk?: unknown;
  rsaPublicJwk?: unknown;
  rsaCertPem?: string | null;
};

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
  company: CompanyDidSource,
  edcProvisioning: { status: string; protocolUrl: string | null } | null,
): DidDocument {
  const did = company.did || buildCompanyDidWeb(company.id);
  const edKeyId = `${did}#key-ed25519`;
  const rsaKeyId = `${did}#key-rsa`;

  const services: ServiceEndpoint[] = [];

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

  const edJwkRaw = company.ed25519PublicJwk as Record<string, unknown> | null | undefined;
  const rsaJwkRaw = company.rsaPublicJwk as Record<string, unknown> | null | undefined;

  if (company.walletProvisioned && edJwkRaw?.kty && rsaJwkRaw?.kty) {
    const edJwk = { ...edJwkRaw, kid: edKeyId };
    // gx-compliance validates the DID document key trust chain via x5u (URL) not x5c (inline DER).
    // jose.importX509(cert, null) fails when cert PEM has no line breaks (the x5c path);
    // x5u fetches proper PEM with line breaks from the /company/:id/cert.pem endpoint → works.
    const domain = (process.env.GAIAX_DID_DOMAIN || 'localhost:8000').replace(/%3A/g, ':');
    const rsaJwk: Record<string, unknown> = { ...rsaJwkRaw, kid: rsaKeyId, alg: 'RS256' };
    if (company.rsaCertPem) {
      rsaJwk.x5u = `https://${domain}/company/${company.id}/cert.pem`;
    }
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: edKeyId,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: edJwk,
        },
        {
          id: rsaKeyId,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: rsaJwk,
        },
      ],
      authentication: [edKeyId],
      assertionMethod: [edKeyId, rsaKeyId],
      service: services.length > 0 ? services : undefined,
    };
  }

  throw new CompanyWalletNotProvisionedError(company.id);
}

function buildUserDidDocument(userId: string): DidDocument {
  const did = `did:smartsense:${userId}`;
  const keyId = `${did}#key-1`;
  const publicKeyJwk = getSmartsenseHolderPublicKeyJwk(did);

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
        publicKeyJwk,
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
  const company = await prisma.company.findFirst({
    where: { did },
    include: { edcProvisioning: true },
  });

  if (company) {
    try {
      return {
        didDocument: buildCompanyDidDocument(
          company,
          company.edcProvisioning,
        ),
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocumentMetadata: {
          created: company.createdAt.toISOString(),
          updated: (company.updatedAt ?? company.createdAt).toISOString(),
        },
      };
    } catch (e) {
      if (e instanceof CompanyWalletNotProvisionedError) {
        return {
          didDocument: null,
          didResolutionMetadata: { error: 'companyWalletNotProvisioned', contentType: 'application/did+ld+json' },
          didDocumentMetadata: {
            created: company.createdAt.toISOString(),
            updated: (company.updatedAt ?? company.createdAt).toISOString(),
          },
        };
      }
      throw e;
    }
  }

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
