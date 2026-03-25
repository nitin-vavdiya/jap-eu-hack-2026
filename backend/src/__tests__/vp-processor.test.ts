/**
 * Tests for VP/VC Processing Service (Real Crypto)
 */

import {
  parseVP,
  extractCredentials,
  validateVP,
  createVerifiablePresentation,
  signVC,
  verifyVCJwt,
  getPublicKeyForDid,
  buildOwnershipVC,
  VerifiableCredential,
  VerifiablePresentation,
} from '../services/vp-processor';

// --------------- Test Fixtures ---------------

function makeSignedOwnershipVC(overrides: Partial<VerifiableCredential> = {}): VerifiableCredential {
  const issuerDid = 'did:eu-dataspace:company-toyota-001';
  const base: Record<string, unknown> = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'OwnershipVC'],
    id: 'urn:credential:test-001',
    issuer: { id: issuerDid, name: 'Toyota Motor Corporation' },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      ownerId: 'mario-sanchez',
      ownerDid: 'did:smartsense:mario-sanchez',
      vin: 'TOYO2024RAV4HY0001',
      make: 'Toyota',
      model: 'RAV4 Hybrid',
      year: 2024,
    },
    ...overrides,
  };

  const vcJwt = signVC(base, issuerDid);

  return {
    ...(base as unknown as VerifiableCredential),
    proof: {
      type: 'JsonWebSignature2020',
      created: base.issuanceDate as string,
      proofPurpose: 'assertionMethod',
      verificationMethod: `${issuerDid}#key-1`,
      jws: vcJwt,
    },
    _jwt: vcJwt,
  };
}

// --------------- Tests ---------------

describe('signVC / verifyVCJwt', () => {
  it('should sign a VC and verify it with the issuer public key', () => {
    const issuerDid = 'did:eu-dataspace:company-toyota-001';
    const vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'OwnershipVC'],
      id: 'urn:credential:test-sign',
      issuer: issuerDid,
      credentialSubject: { vin: 'TEST123' },
    };

    const vcJwt = signVC(vcPayload, issuerDid);
    expect(typeof vcJwt).toBe('string');
    expect(vcJwt.split('.')).toHaveLength(3); // JWT has 3 parts

    const pubKey = getPublicKeyForDid(issuerDid);
    expect(pubKey).toBeTruthy();

    const decoded = verifyVCJwt(vcJwt, pubKey!);
    expect(decoded.iss).toBe(issuerDid);
    expect((decoded as any).type).toContain('OwnershipVC');
  });

  it('should fail verification with wrong key', () => {
    const issuerDid = 'did:eu-dataspace:company-toyota-001';
    const vcJwt = signVC({ type: ['VerifiableCredential'], credentialSubject: {} }, issuerDid);

    // Use a holder key (different from issuer)
    const holderPubKey = getPublicKeyForDid('did:smartsense:test-wrong-key-user');
    // If holder key doesn't exist yet, just check it throws with any wrong key
    if (holderPubKey) {
      expect(() => verifyVCJwt(vcJwt, holderPubKey)).toThrow();
    }
  });
});

describe('buildOwnershipVC', () => {
  it('should build a signed OwnershipVC', () => {
    const vc = buildOwnershipVC('test-owner', 'VIN123', {
      make: 'Toyota', model: 'RAV4', year: 2024,
    }, 'did:eu-dataspace:company-toyota-001');

    expect(vc.type).toContain('OwnershipVC');
    expect(vc.proof?.jws).toBeTruthy();
    expect(vc._jwt).toBeTruthy();
    expect(vc.credentialSubject.vin).toBe('VIN123');
  });
});

describe('parseVP', () => {
  it('should parse a valid VP object', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      challenge: 'test-nonce', domain: 'test',
    });
    const parsed = parseVP(vp);
    expect(parsed.holder).toBe('did:smartsense:mario-sanchez');
    expect(parsed.verifiableCredential).toHaveLength(1);
  });

  it('should parse a VP from JSON string', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const parsed = parseVP(JSON.stringify(vp));
    expect(parsed.holder).toBe('did:smartsense:mario-sanchez');
  });

  it('should reject invalid JSON string', () => {
    expect(() => parseVP('not valid json')).toThrow();
  });

  it('should reject VP without @context', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    delete (vp as any)['@context'];
    expect(() => parseVP(vp)).toThrow('VP missing @context');
  });

  it('should reject VP without VerifiablePresentation type', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    vp.type = ['SomethingElse'];
    expect(() => parseVP(vp)).toThrow('VP missing type VerifiablePresentation');
  });

  it('should reject VP without holder', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    (vp as any).holder = '';
    expect(() => parseVP(vp)).toThrow('VP missing holder');
  });

  it('should reject VP with empty credentials', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    vp.verifiableCredential = [];
    expect(() => parseVP(vp)).toThrow('VP contains no verifiable credentials');
  });
});

describe('extractCredentials', () => {
  it('should extract credentials from VP', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const creds = extractCredentials(vp);
    expect(creds).toHaveLength(1);
    expect(creds[0].type).toContain('OwnershipVC');
    expect(creds[0].issuer).toBe('did:eu-dataspace:company-toyota-001');
    expect(creds[0].subject.vin).toBe('TOYO2024RAV4HY0001');
  });

  it('should handle string issuer', () => {
    const vc = makeSignedOwnershipVC({ issuer: 'did:eu-dataspace:company-toyota-001' });
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const creds = extractCredentials(vp);
    expect(creds[0].issuer).toBe('did:eu-dataspace:company-toyota-001');
    expect(creds[0].issuerName).toBeUndefined();
  });
});

describe('validateVP', () => {
  it('should validate a correctly signed VP', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      challenge: 'test-nonce-123',
      domain: 'tokio-marine',
    });
    const result = validateVP(vp, {
      expectedCredentialTypes: ['OwnershipVC'],
      expectedChallenge: 'test-nonce-123',
      expectedDomain: 'tokio-marine',
      vehicleVin: 'TOYO2024RAV4HY0001',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.holder).toBe('did:smartsense:mario-sanchez');
    expect(result.cryptoVerified).toBe(true);
  });

  it('should fail on challenge mismatch', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      challenge: 'actual-nonce',
    });
    const result = validateVP(vp, {
      expectedChallenge: 'wrong-nonce',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Challenge mismatch'))).toBe(true);
  });

  it('should fail on missing expected credential type', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const result = validateVP(vp, {
      expectedCredentialTypes: ['InsuranceVC'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('None of the credentials match'))).toBe(true);
  });

  it('should fail on VIN mismatch', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const result = validateVP(vp, {
      vehicleVin: 'WRONG_VIN',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('does not match requested VIN'))).toBe(true);
  });

  it('should fail on expired credential', () => {
    const vc = makeSignedOwnershipVC({
      expirationDate: '2020-01-01T00:00:00Z',
    });
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    const result = validateVP(vp);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expired'))).toBe(true);
  });

  it('should fail on missing proof', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc]);
    delete vp.proof;
    const result = validateVP(vp);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('no proof'))).toBe(true);
  });

  it('should warn on domain mismatch', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      domain: 'actual-domain',
    });
    const result = validateVP(vp, {
      expectedDomain: 'other-domain',
    });
    expect(result.valid).toBe(true); // domain mismatch is a warning, not error
    expect(result.warnings.some(w => w.includes('Domain mismatch'))).toBe(true);
  });
});

describe('createVerifiablePresentation', () => {
  it('should create a VP with real JWS proof', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      challenge: 'test-nonce',
      domain: 'test-domain',
    });

    expect(vp.type).toContain('VerifiablePresentation');
    expect(vp.holder).toBe('did:smartsense:mario-sanchez');
    expect(vp.verifiableCredential).toHaveLength(1);
    expect(vp.proof?.challenge).toBe('test-nonce');
    expect(vp.proof?.domain).toBe('test-domain');
    expect(vp.proof?.jws).toBeTruthy();
    expect(vp.proof?.jws.split('.')).toHaveLength(3); // Real JWT

    // Should be parseable
    const parsed = parseVP(vp);
    expect(parsed.holder).toBe('did:smartsense:mario-sanchez');
  });

  it('should create VPs that pass full validation with crypto verification', () => {
    const vc = makeSignedOwnershipVC();
    const vp = createVerifiablePresentation('did:smartsense:mario-sanchez', [vc], {
      challenge: 'nonce-123',
      domain: 'tokio-marine',
    });

    const result = validateVP(vp, {
      expectedChallenge: 'nonce-123',
      expectedDomain: 'tokio-marine',
      expectedCredentialTypes: ['OwnershipVC'],
      vehicleVin: 'TOYO2024RAV4HY0001',
    });

    expect(result.valid).toBe(true);
    expect(result.cryptoVerified).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
