/**
 * BYOW-oriented issuance abstraction (Phase 3a of SSI plan).
 * Implemented by WaltIdWalletService once walt.id orchestration is consolidated here.
 */
export interface VerificationResult {
  valid: boolean;
  errors?: string[];
}

export interface WalletIssuanceService {
  issueCredential(params: {
    issuerDid: string;
    holderDid: string;
    credentialType: string;
    credentialData: Record<string, unknown>;
    keyType: 'ed25519' | 'rsa';
  }): Promise<string>;

  requestPresentation(params: {
    verifierDid: string;
    credentialType: string;
    nonce: string;
  }): Promise<string>;

  verifyPresentation(params: {
    vpToken: string;
    nonce: string;
    audience: string;
  }): Promise<VerificationResult>;
}
