import { buildLegalParticipantVC, validateOrgCredentialFields } from '../../backend/src/services/gaiax/vc-builder';
import { OrgCredentialRecord } from '../../backend/src/services/gaiax/types';

function makeSampleOrg(overrides?: Partial<OrgCredentialRecord>): OrgCredentialRecord {
  return {
    id: 'test-id-123',
    companyId: 'company-123',
    legalName: 'Test Corp GmbH',
    legalRegistrationNumber: {
      vatId: 'DE123456789',
      eoriNumber: 'DE987654321000',
    },
    legalAddress: {
      streetAddress: 'Musterstrasse 1',
      locality: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      countrySubdivisionCode: 'DE-BE',
    },
    headquartersAddress: {
      streetAddress: 'Musterstrasse 1',
      locality: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      countrySubdivisionCode: 'DE-BE',
    },
    website: 'https://testcorp.de',
    contactEmail: 'admin@testcorp.de',
    did: 'did:web:participant.gxdch.io:test',
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2025-01-01T00:00:00.000Z',
    verificationStatus: 'draft',
    verificationAttempts: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildLegalParticipantVC', () => {
  it('should create a valid Gaia-X LegalParticipant VC', () => {
    const org = makeSampleOrg();
    const vc = buildLegalParticipantVC(org);

    expect(vc['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    expect(vc['@context']).toContain('https://w3id.org/gaia-x/development');
    expect(vc['@type']).toContain('VerifiableCredential');
    expect(vc['@type']).toContain('gx:LegalParticipant');
    expect(vc.id).toBe('urn:uuid:test-id-123');
    expect(vc.issuer).toBe('did:web:participant.gxdch.io:test');
    expect(vc.validFrom).toBe('2024-01-01T00:00:00.000Z');
    expect(vc.validUntil).toBe('2025-01-01T00:00:00.000Z');
  });

  it('should map legal name correctly', () => {
    const vc = buildLegalParticipantVC(makeSampleOrg({ legalName: 'TATA Motors Limited' }));
    expect(vc.credentialSubject['gx:legalName']).toBe('TATA Motors Limited');
  });

  it('should map registration numbers correctly', () => {
    const vc = buildLegalParticipantVC(makeSampleOrg());
    const reg = vc.credentialSubject['gx:legalRegistrationNumber'];
    expect(reg['gx:vatID']).toBe('DE123456789');
    expect(reg['gx:EORI']).toBe('DE987654321000');
  });

  it('should omit undefined registration numbers', () => {
    const org = makeSampleOrg({
      legalRegistrationNumber: { vatId: 'DE111', eoriNumber: undefined },
    });
    const vc = buildLegalParticipantVC(org);
    const reg = vc.credentialSubject['gx:legalRegistrationNumber'];
    expect(reg['gx:vatID']).toBe('DE111');
    expect(reg['gx:EORI']).toBeUndefined();
  });

  it('should map addresses correctly', () => {
    const vc = buildLegalParticipantVC(makeSampleOrg());
    const addr = vc.credentialSubject['gx:legalAddress'];
    expect(addr['@type']).toBe('gx:Address');
    expect(addr['gx:countryCode']).toBe('DE');
    expect(addr['gx:locality']).toBe('Berlin');
    expect(addr['gx:streetAddress']).toBe('Musterstrasse 1');
    expect(addr['gx:postalCode']).toBe('10115');
    expect(addr['gx:countrySubdivisionCode']).toBe('DE-BE');
  });

  it('should auto-generate DID if not provided', () => {
    const org = makeSampleOrg({ did: undefined });
    const vc = buildLegalParticipantVC(org);
    expect(vc.issuer).toContain('did:web:participant.gxdch.io:');
    expect(vc.credentialSubject['@id']).toBe(vc.issuer);
  });
});

describe('validateOrgCredentialFields', () => {
  it('should pass for valid data', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg());
    expect(errors).toHaveLength(0);
  });

  it('should require legalName', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg({ legalName: '' }));
    expect(errors).toContain('legalName is required');
  });

  it('should require at least one registration number', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg({
      legalRegistrationNumber: {},
    }));
    expect(errors).toContain('At least one legal registration number is required');
  });

  it('should require address fields', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg({
      legalAddress: { streetAddress: '', locality: '', postalCode: '', countryCode: '', countrySubdivisionCode: '' },
    }));
    expect(errors).toContain('legalAddress.streetAddress is required');
    expect(errors).toContain('legalAddress.countryCode is required');
  });

  it('should require contactEmail', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg({ contactEmail: '' }));
    expect(errors).toContain('contactEmail is required');
  });

  it('should require validity dates', () => {
    const errors = validateOrgCredentialFields(makeSampleOrg({ validFrom: '', validUntil: '' }));
    expect(errors).toContain('validFrom is required');
    expect(errors).toContain('validUntil is required');
  });
});
