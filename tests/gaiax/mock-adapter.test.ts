import { GaiaXMockAdapter } from '../../backend/src/services/gaiax/mock-adapter';
import { buildLegalParticipantVC } from '../../backend/src/services/gaiax/vc-builder';
import { OrgCredentialRecord } from '../../backend/src/services/gaiax/types';

function makeSampleOrg(): OrgCredentialRecord {
  return {
    id: 'mock-test-123',
    companyId: 'company-123',
    legalName: 'Mock Test Corp',
    legalRegistrationNumber: { vatId: 'DE123456789' },
    legalAddress: { streetAddress: 'Test St 1', locality: 'Berlin', postalCode: '10115', countryCode: 'DE', countrySubdivisionCode: 'DE-BE' },
    headquartersAddress: { streetAddress: 'Test St 1', locality: 'Berlin', postalCode: '10115', countryCode: 'DE', countrySubdivisionCode: 'DE-BE' },
    contactEmail: 'test@mock.de',
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2025-01-01T00:00:00.000Z',
    verificationStatus: 'draft',
    verificationAttempts: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('GaiaXMockAdapter', () => {
  const adapter = new GaiaXMockAdapter();

  it('should return successful notary result', async () => {
    const vc = buildLegalParticipantVC(makeSampleOrg());
    const result = await adapter.submitNotary(vc);
    expect(result.status).toBe('success');
    expect(result.registrationId).toBeTruthy();
    expect(result.proof).toBeTruthy();
    expect(result.proof!.type).toBe('JsonWebSignature2020');
    expect(result.proof!.jws).toContain('MOCK_SIGNATURE');
    expect(result.endpointSetUsed).toBe('Mock Adapter');
  });

  it('should return compliant compliance result', async () => {
    const vc = buildLegalParticipantVC(makeSampleOrg());
    const result = await adapter.submitCompliance(vc);
    expect(result.status).toBe('compliant');
    expect(result.complianceLevel).toBe('gx:BasicCompliance');
    expect(result.issuedCredential).toBeTruthy();
    expect(result.endpointSetUsed).toBe('Mock Adapter');
  });

  it('should return registry response', async () => {
    const result = await adapter.resolveRegistry('Test Corp');
    expect(result.type).toBe('gx:RegistryResponse');
  });
});
