import { OrgCredentialRecord, LegalParticipantVC, LegalRegistrationNumber, GaiaXAddress } from './types';

// Gaia-X T&C hash from the compliance service fixtures
const GAIAX_TERMS_AND_CONDITIONS_HASH = '067dcac5efd18c1927deb1ffed3feab6d0ad044c0a9a263e6d5d8bdc43224515';

/**
 * Base URL for VC identifiers. Uses the ngrok domain so all VC URIs are publicly resolvable.
 * Falls back to localhost for local dev.
 */
export function getVCBaseUrl(): string {
  const domain = process.env.GAIAX_DID_DOMAIN;
  if (domain) {
    // domain is URL-encoded for DID (e.g. "abc.ngrok-free.app"), use https
    return `https://${domain.replace(/%3A/g, ':')}`;
  }
  return 'http://localhost:8000';
}

export function buildLegalParticipantVC(org: OrgCredentialRecord, did?: string): LegalParticipantVC {
  did = did || org.did || `did:web:participant.gxdch.io:${org.id}`;
  const baseUrl = getVCBaseUrl();

  // Build registration number reference (points to the LRN VC's credentialSubject id)
  const lrnVcId = `${baseUrl}/vc/${org.id}/lrn`;

  const buildAddress = (addr: OrgCredentialRecord['legalAddress']): GaiaXAddress => ({
    type: 'gx:Address',
    'gx:countryCode': addr.countryCode,
  });

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/gaia-x/development#',
    ],
    type: ['VerifiableCredential', 'gx:LegalPerson'],
    id: `${baseUrl}/vc/${org.id}`,
    issuer: did,
    validFrom: org.validFrom || new Date().toISOString(),
    credentialSubject: {
      id: `${baseUrl}/vc/${org.id}#cs`,
      'https://schema.org/name': org.legalName,
      'gx:registrationNumber': { id: `${lrnVcId}#cs` },
      'gx:legalAddress': buildAddress(org.legalAddress),
      'gx:headquartersAddress': buildAddress(org.headquartersAddress),
    },
  } as unknown as LegalParticipantVC;
}

/**
 * Build a GaiaXTermsAndConditions VC (gx:Issuer type).
 * Required by the compliance service for every issuer in the VP.
 */
export function buildTermsAndConditionsVC(did: string, orgId: string): Record<string, unknown> {
  const baseUrl = getVCBaseUrl();
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/gaia-x/development#',
    ],
    type: ['VerifiableCredential', 'gx:Issuer'],
    id: `${baseUrl}/vc/${orgId}/tandc`,
    issuer: did,
    validFrom: new Date().toISOString(),
    credentialSubject: {
      id: `${baseUrl}/vc/${orgId}/tandc#cs`,
      gaiaxTermsAndConditions: GAIAX_TERMS_AND_CONDITIONS_HASH,
    },
  };
}

export function validateOrgCredentialFields(data: Partial<OrgCredentialRecord>): string[] {
  const errors: string[] = [];
  if (!data.legalName?.trim()) errors.push('legalName is required');
  if (!data.contactEmail?.trim()) errors.push('contactEmail is required');

  const reg = data.legalRegistrationNumber;
  if (!reg || (!reg.vatId && !reg.eoriNumber && !reg.euid && !reg.leiCode && !reg.taxId && !reg.localId)) {
    errors.push('At least one legal registration number is required');
  }

  const addr = data.legalAddress;
  if (!addr?.countryCode) errors.push('legalAddress.countryCode is required');
  if (!addr?.streetAddress) errors.push('legalAddress.streetAddress is required');
  if (!addr?.locality) errors.push('legalAddress.locality is required');
  if (!addr?.postalCode) errors.push('legalAddress.postalCode is required');

  return errors;
}
