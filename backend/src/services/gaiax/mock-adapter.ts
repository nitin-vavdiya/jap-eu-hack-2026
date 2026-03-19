import { v4 as uuidv4 } from 'uuid';
import {
  ComplianceResult,
  NotaryResult,
  LegalParticipantVC,
  VerifiableProof,
} from './types';

export class GaiaXMockAdapter {
  async submitNotary(vc: LegalParticipantVC): Promise<NotaryResult> {
    await this.simulateDelay(800);
    const proof: VerifiableProof = {
      type: 'JsonWebSignature2020',
      created: new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: 'did:web:mock-notary.gxdch.io#key-1',
      jws: `eyJhbGciOiJQUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..MOCK_SIGNATURE_${uuidv4().slice(0, 8)}`,
    };

    return {
      status: 'success',
      registrationId: `notary-${uuidv4().slice(0, 12)}`,
      proof,
      raw: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [vc],
        proof,
      },
      endpointSetUsed: 'Mock Adapter',
      timestamp: new Date().toISOString(),
    };
  }

  async submitCompliance(vc: LegalParticipantVC, _complianceLevel?: string): Promise<ComplianceResult> {
    await this.simulateDelay(1200);
    return {
      status: 'compliant',
      complianceLevel: 'gx:BasicCompliance',
      issuedCredential: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/gaia-x/development',
        ],
        type: ['VerifiableCredential', 'gx:ComplianceCredential'],
        id: `https://compliance.mock.gxdch.io/credential-offers/${uuidv4()}`,
        issuer: 'did:web:compliance.mock.gxdch.io',
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        credentialSubject: [{
          type: 'gx:compliance',
          id: vc.credentialSubject.id,
          integrity: 'sha256-mock-hash',
          version: '22.10',
        }],
        proof: {
          type: 'JsonWebSignature2020',
          created: new Date().toISOString(),
          proofPurpose: 'assertionMethod',
          verificationMethod: 'did:web:compliance.mock.gxdch.io#key-1',
          jws: `eyJhbGciOiJQUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..MOCK_COMPLIANCE_${uuidv4().slice(0, 8)}`,
        },
      },
      endpointSetUsed: 'Mock Adapter',
      timestamp: new Date().toISOString(),
    };
  }

  async resolveRegistry(_query: string): Promise<Record<string, unknown>> {
    await this.simulateDelay(400);
    return {
      '@context': ['https://w3id.org/gaia-x/development'],
      type: 'gx:RegistryResponse',
      entries: [],
    };
  }

  private simulateDelay(ms: number): Promise<void> {
    const jitter = Math.random() * ms * 0.3;
    return new Promise(r => setTimeout(r, ms + jitter));
  }
}
