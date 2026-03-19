export interface GaiaXEndpointSet {
  name: string;
  compliance: string;
  registry: string;
  notary: string;
  priority: number;
}

export interface GaiaXConfig {
  endpointSets: GaiaXEndpointSet[];
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  mockMode: boolean;
}

export interface GaiaXHealthStatus {
  endpointSet: string;
  compliance: { healthy: boolean; latencyMs: number; error?: string };
  registry: { healthy: boolean; latencyMs: number; error?: string };
  notary: { healthy: boolean; latencyMs: number; error?: string };
  overall: boolean;
  checkedAt: string;
}

export interface LegalParticipantVC {
  '@context': string[];
  type: string[];
  id: string;
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    'https://schema.org/name': string;
    'gx:registrationNumber': { id: string };
    'gx:legalAddress': GaiaXAddress;
    'gx:headquartersAddress': GaiaXAddress;
  };
  proof?: VerifiableProof;
  [key: string]: unknown;
}

export interface LegalRegistrationNumber {
  '@type'?: string;
  'gx:vatID'?: string;
  'gx:EORI'?: string;
  'gx:EUID'?: string;
  'gx:leiCode'?: string;
  'gx:taxID'?: string;
  'gx:local'?: string;
}

export interface GaiaXAddress {
  type: string;
  'gx:countryCode': string;
}

export interface VerifiableProof {
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
  jws?: string;
}

export interface ComplianceResult {
  status: 'compliant' | 'non-compliant' | 'error' | 'pending';
  complianceLevel?: string;
  issuedCredential?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
  endpointSetUsed: string;
  timestamp: string;
  raw?: Record<string, unknown>;
}

export interface NotaryResult {
  status: 'success' | 'error';
  registrationId?: string;
  registrationNumberVC?: string;
  proof?: VerifiableProof;
  raw?: Record<string, unknown>;
  endpointSetUsed: string;
  timestamp: string;
}

export interface OrgCredentialRecord {
  id: string;
  companyId: string;
  legalName: string;
  legalRegistrationNumber: {
    vatId?: string;
    eoriNumber?: string;
    euid?: string;
    leiCode?: string;
    taxId?: string;
    localId?: string;
  };
  legalAddress: {
    streetAddress: string;
    locality: string;
    postalCode: string;
    countryCode: string;
    countrySubdivisionCode: string;
  };
  headquartersAddress: {
    streetAddress: string;
    locality: string;
    postalCode: string;
    countryCode: string;
    countrySubdivisionCode: string;
  };
  website?: string;
  contactEmail: string;
  did?: string;
  validFrom: string;
  validUntil: string;
  verificationStatus: 'draft' | 'submitted' | 'verifying' | 'verified' | 'failed';
  verificationAttempts: VerificationAttempt[];
  vcPayload?: LegalParticipantVC;
  vcJwt?: string;
  complianceResult?: ComplianceResult;
  notaryResult?: NotaryResult;
  issuedVCs?: IssuedVC[];
  createdAt: string;
  updatedAt: string;
}

export interface IssuedVC {
  id: string;
  type: string;
  jwt?: string;
  json?: Record<string, unknown>;
  issuedAt: string;
  issuer: string;
  storedInWallet: boolean;
  walletId?: string;
}

export interface VerificationAttempt {
  id: string;
  timestamp: string;
  endpointSetUsed: string;
  step: 'preparing' | 'notary' | 'registry' | 'compliance' | 'completed' | 'failed';
  status: 'success' | 'error';
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface VerificationProgress {
  orgCredentialId: string;
  currentStep: string;
  steps: {
    name: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }[];
  endpointSetUsed: string;
  startedAt: string;
}
