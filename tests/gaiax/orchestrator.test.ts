import { GaiaXOrchestrator } from '../../backend/src/services/gaiax/orchestrator';
import { GaiaXClient } from '../../backend/src/services/gaiax/client';
import { OrgCredentialRecord } from '../../backend/src/services/gaiax/types';

function makeSampleOrg(): OrgCredentialRecord {
  return {
    id: 'orch-test-123',
    companyId: 'company-123',
    legalName: 'Orchestrator Test Corp',
    legalRegistrationNumber: { vatId: 'DE111222333' },
    legalAddress: { streetAddress: 'Main St 1', locality: 'Munich', postalCode: '80331', countryCode: 'DE', countrySubdivisionCode: 'DE-BY' },
    headquartersAddress: { streetAddress: 'Main St 1', locality: 'Munich', postalCode: '80331', countryCode: 'DE', countrySubdivisionCode: 'DE-BY' },
    contactEmail: 'test@orch.de',
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2025-01-01T00:00:00.000Z',
    verificationStatus: 'draft',
    verificationAttempts: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('GaiaXOrchestrator (mock mode)', () => {
  const client = new GaiaXClient({ mockMode: true });
  const orchestrator = new GaiaXOrchestrator(client);

  it('should complete full verification flow in mock mode', async () => {
    const org = makeSampleOrg();
    const result = await orchestrator.verify(org);

    expect(result.vc).toBeTruthy();
    expect(result.vc['@type']).toContain('gx:LegalParticipant');
    expect(result.notaryResult.status).toBe('success');
    expect(result.complianceResult.status).toBe('compliant');
    expect(result.attempts.length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('should emit progress events', async () => {
    const org = makeSampleOrg();
    const steps: string[] = [];

    orchestrator.onProgress(org.id, (progress) => {
      steps.push(progress.currentStep);
    });

    await orchestrator.verify(org);
    orchestrator.removeProgressListener(org.id);

    expect(steps).toContain('preparing');
    expect(steps).toContain('notary');
    expect(steps).toContain('compliance');
    expect(steps).toContain('completed');
  }, 15000);

  it('should include proof in returned VC', async () => {
    const org = makeSampleOrg();
    const result = await orchestrator.verify(org);
    expect(result.vc.proof).toBeTruthy();
    expect(result.vc.proof!.type).toBe('JsonWebSignature2020');
  }, 15000);
});
