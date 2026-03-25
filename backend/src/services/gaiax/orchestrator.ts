import { v4 as uuidv4 } from 'uuid';
import { GaiaXClient } from './client';
import { GaiaXLiveClient } from './live-client';
import { GaiaXMockAdapter } from './mock-adapter';
import { getVPSigner } from './vp-signer';
import { buildLegalParticipantVC, buildTermsAndConditionsVC, buildRegistrationNumberVC, getVCBaseUrl } from './vc-builder';
import {
  OrgCredentialRecord,
  ComplianceResult,
  NotaryResult,
  VerificationAttempt,
  VerificationProgress,
  LegalParticipantVC,
  IssuedVC,
} from './types';
import {
  issueCredentialOID4VCI,
  storeCredentialInWallet,
} from '../waltid';

export class GaiaXOrchestrator {
  private client: GaiaXClient;
  private liveClient: GaiaXLiveClient;
  private mockAdapter: GaiaXMockAdapter;
  private progressCallbacks: Map<string, (progress: VerificationProgress) => void> = new Map();

  constructor(client?: GaiaXClient) {
    this.client = client || new GaiaXClient();
    this.liveClient = new GaiaXLiveClient(this.client.getConfig().timeout);
    this.mockAdapter = new GaiaXMockAdapter();
  }

  onProgress(orgId: string, callback: (progress: VerificationProgress) => void) {
    this.progressCallbacks.set(orgId, callback);
  }

  removeProgressListener(orgId: string) {
    this.progressCallbacks.delete(orgId);
  }

  async verify(org: OrgCredentialRecord): Promise<{
    vc: LegalParticipantVC;
    notaryResult: NotaryResult;
    complianceResult: ComplianceResult;
    attempts: VerificationAttempt[];
    issuedVCs: IssuedVC[];
  }> {
    const attempts: VerificationAttempt[] = [];
    const issuedVCs: IssuedVC[] = [];

    // Step 1: Build VC using the company's own DID as issuer (self-assertion)
    // The company DID document hosts the platform's public key (custodial model),
    // so GXDCH can resolve the company DID → get public key → verify signature
    this.emitProgress(org.id, 'preparing', 'in-progress');
    const companyDid = org.did || undefined;
    const vc = buildLegalParticipantVC(org, companyDid);
    this.emitProgress(org.id, 'preparing', 'completed');

    if (this.client.isMockMode) {
      const result = await this.verifyWithMock(org, vc, attempts);
      return { ...result, issuedVCs };
    }

    return this.verifyWithLive(org, vc, attempts, issuedVCs);
  }

  private async verifyWithMock(
    org: OrgCredentialRecord,
    vc: LegalParticipantVC,
    attempts: VerificationAttempt[]
  ) {
    this.emitProgress(org.id, 'notary', 'in-progress');
    const notaryStart = Date.now();
    const notaryResult = await this.mockAdapter.submitNotary(vc);
    vc.proof = notaryResult.proof;
    attempts.push({
      id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: 'Mock Adapter',
      step: 'notary', status: 'success', durationMs: Date.now() - notaryStart,
    });
    this.emitProgress(org.id, 'notary', 'completed');

    this.emitProgress(org.id, 'registry', 'in-progress');
    await this.mockAdapter.resolveRegistry(org.legalName);
    this.emitProgress(org.id, 'registry', 'completed');

    this.emitProgress(org.id, 'compliance', 'in-progress');
    const complianceStart = Date.now();
    const complianceResult = await this.mockAdapter.submitCompliance(vc);
    attempts.push({
      id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: 'Mock Adapter',
      step: 'compliance', status: 'success', durationMs: Date.now() - complianceStart,
    });
    this.emitProgress(org.id, 'compliance', 'completed');
    this.emitProgress(org.id, 'completed', 'completed');

    return { vc, notaryResult, complianceResult, attempts };
  }

  private async verifyWithLive(
    org: OrgCredentialRecord,
    vc: LegalParticipantVC,
    attempts: VerificationAttempt[],
    issuedVCs: IssuedVC[],
  ) {
    // Select a healthy endpoint set (will try lab.gaia-x.eu first)
    const selected = await this.client.selectHealthyEndpointSet();
    if (!selected) {
      attempts.push({
        id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: 'none',
        step: 'failed', status: 'error', durationMs: 0,
        error: 'All Gaia-X endpoint sets are unreachable',
      });
      throw new Error('All Gaia-X endpoint sets are unreachable');
    }

    const { endpointSet } = selected;
    const signer = getVPSigner();

    // Use the company's own DID for all VC/VP signing (custodial model)
    // The company DID document at /company/<id>/did.json hosts the platform's public key
    const companyDid = org.did!;
    const companyKid = `${companyDid}#key-1`;
    const companyIdentity = { did: companyDid, kid: companyKid };
    const publicKeyJwk = signer.getPublicKeyJwk();

    // Log signer identity for debugging
    const crypto = await import('crypto');
    const keyFingerprint = crypto.createHash('sha256')
      .update(JSON.stringify({ n: publicKeyJwk.n, e: publicKeyJwk.e }))
      .digest('hex').slice(0, 16);
    console.log(`[GaiaX] ──── Compliance submission for org ${org.id} ────`);
    console.log(`[GaiaX]   company DID    = ${companyDid}`);
    console.log(`[GaiaX]   company kid    = ${companyKid}`);
    console.log(`[GaiaX]   key fingerprint= ${keyFingerprint}`);
    console.log(`[GaiaX]   DID doc URL    = https://${(process.env.GAIAX_DID_DOMAIN || 'localhost:8000').replace(/%3A/g, ':')}/company/${org.companyId}/did.json`);
    console.log(`[GaiaX]   endpoint set   = ${endpointSet.name}`);
    console.log(`[GaiaX]   compliance URL = ${endpointSet.compliance}`);
    console.log(`[GaiaX]   has x5c cert   = ${(signer.getX5c()?.length || 0) > 0}`);

    // ── Step 2: Sign the LegalParticipant VC as JWT using company DID (custodial) ──
    this.emitProgress(org.id, 'preparing', 'in-progress');
    const vcJwt = signer.signVCAs(vc as unknown as Record<string, unknown>, companyIdentity);
    console.log(`[GaiaX] Signed LegalParticipant VC-JWT as ${companyDid} (${vcJwt.length} chars)`);

    // Try to issue via walt.id as well for proper OID4VCI credential offer
    const waltIdOffer = await this.tryWaltIdIssuance(org, vc, companyDid);
    if (waltIdOffer) {
      issuedVCs.push({
        id: `vc-lp-${uuidv4().slice(0, 8)}`,
        type: 'LegalParticipantVC',
        jwt: vcJwt,
        issuedAt: new Date().toISOString(),
        issuer: companyDid,
        storedInWallet: false,
        json: vc as unknown as Record<string, unknown>,
      });

      // Attempt to store in walt.id wallet
      const stored = await storeCredentialInWallet(waltIdOffer);
      if (stored) {
        issuedVCs[issuedVCs.length - 1].storedInWallet = true;
        console.log('[GaiaX] LegalParticipant VC stored in walt.id wallet');
      }
    }
    this.emitProgress(org.id, 'preparing', 'completed');

    // ── Step 3: Call real GXDCH Notary ──
    this.emitProgress(org.id, 'notary', 'in-progress');
    const notaryStart = Date.now();
    let notaryResult: NotaryResult;

    const regEntry = this.liveClient.getNotaryType(org.legalRegistrationNumber);
    if (regEntry) {
      console.log(`[GaiaX] Calling notary: ${regEntry.type} = ${regEntry.value}`);
      notaryResult = await this.liveClient.verifyRegistrationNumber(
        endpointSet.notary,
        regEntry.type,
        regEntry.value,
        `${getVCBaseUrl()}/vc/${org.id}`,
        companyDid,
      );

      attempts.push({
        id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: endpointSet.name,
        step: 'notary', status: notaryResult.status === 'success' ? 'success' : 'error',
        durationMs: Date.now() - notaryStart,
        error: notaryResult.status === 'error' ? JSON.stringify(notaryResult.raw) : undefined,
        details: notaryResult.raw,
      });

      if (notaryResult.registrationNumberVC) {
        issuedVCs.push({
          id: `vc-regnum-${uuidv4().slice(0, 8)}`,
          type: 'RegistrationNumberVC',
          jwt: notaryResult.registrationNumberVC,
          issuedAt: new Date().toISOString(),
          issuer: endpointSet.notary,
          storedInWallet: false,
        });
      }
    } else {
      notaryResult = {
        status: 'error', endpointSetUsed: endpointSet.name, timestamp: new Date().toISOString(),
        raw: { error: 'No supported registration number type found (need VAT, EORI, LEI, or Tax ID)' },
      };
      attempts.push({
        id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: endpointSet.name,
        step: 'notary', status: 'error', durationMs: Date.now() - notaryStart,
        error: 'No supported registration number type',
      });
    }
    this.emitProgress(org.id, 'notary', notaryResult.status === 'success' ? 'completed' : 'failed');

    // ── Step 4: Registry check (informational) ──
    this.emitProgress(org.id, 'registry', 'in-progress');
    try {
      const registryResult = await this.liveClient.checkTrustAnchor(endpointSet.registry);
      console.log(`[GaiaX] Registry check:`, registryResult.alive ? 'reachable' : 'unreachable');
    } catch { /* Registry is informational */ }
    this.emitProgress(org.id, 'registry', 'completed');

    // ── Step 5: Submit VP-JWT to real GXDCH Compliance ──
    this.emitProgress(org.id, 'compliance', 'in-progress');
    const complianceStart = Date.now();

    // Build VP with 3 self-signed VCs (Loire format), all issued by the company DID:
    // 1. LegalPerson VC, 2. Registration Number VC, 3. T&C (gx:Issuer) VC
    const lrnPayload = buildRegistrationNumberVC(companyDid, org.id, org.legalRegistrationNumber, org.legalAddress.countryCode);
    const lrnJwt = signer.signVCAs(lrnPayload, companyIdentity);
    console.log(`[GaiaX] Signed Registration Number VC-JWT (${(lrnPayload.type as string[])[1]}) as ${companyDid}`);

    const tandcPayload = buildTermsAndConditionsVC(companyDid, org.id);
    const tandcJwt = signer.signVCAs(tandcPayload, companyIdentity);
    const vcsForVP = [vcJwt, lrnJwt, tandcJwt];
    console.log(`[GaiaX] Signed T&C VC-JWT for compliance as ${companyDid}`);

    const vpJwt = signer.signVPAs(vcsForVP, companyIdentity, endpointSet.compliance);
    console.log(`[GaiaX] Signed VP-JWT (${vpJwt.length} chars) for compliance submission as ${companyDid}`);

    // Log VP-JWT header for debugging signature verification failures
    try {
      const vpHeader = JSON.parse(Buffer.from(vpJwt.split('.')[0], 'base64url').toString());
      console.log(`[GaiaX] VP-JWT header:`, JSON.stringify(vpHeader));
    } catch { /* ignore parse errors */ }

    // Self-verify: check our own signature before sending to compliance
    try {
      const jwtModule = await import('jsonwebtoken');
      const verified = jwtModule.verify(vpJwt, signer['publicKey'], { algorithms: ['RS256'] });
      console.log(`[GaiaX] Self-verification: PASSED (VP-JWT signature is valid with our public key)`);
    } catch (selfVerifyErr: any) {
      console.error(`[GaiaX] Self-verification: FAILED — ${selfVerifyErr.message}`);
      console.error(`[GaiaX]   This means the signing key and public key are mismatched!`);
    }

    // Fetch company DID document to verify the compliance service will see the right key
    try {
      const axios = (await import('axios')).default;
      const domain = (process.env.GAIAX_DID_DOMAIN || 'localhost:8000').replace(/%3A/g, ':');
      const didDocUrl = `https://${domain}/company/${org.companyId}/did.json`;
      const didDocResp = await axios.get(didDocUrl, { timeout: 5000 }).catch(() => null);
      if (didDocResp) {
        const servedKey = didDocResp.data?.verificationMethod?.[0]?.publicKeyJwk;
        const localKey = signer.getPublicKeyJwk();
        const keysMatch = servedKey?.n === localKey.n && servedKey?.e === localKey.e;
        console.log(`[GaiaX] DID doc fetch: ${didDocUrl} → ${didDocResp.status}`);
        console.log(`[GaiaX]   served key n   = ${String(servedKey?.n).slice(0, 20)}...`);
        console.log(`[GaiaX]   local  key n   = ${String(localKey.n).slice(0, 20)}...`);
        console.log(`[GaiaX]   keys match     = ${keysMatch}`);
        if (!keysMatch) {
          console.error(`[GaiaX]   ⚠ KEY MISMATCH — company DID document serves a different public key than what we're signing with!`);
        }
      } else {
        console.warn(`[GaiaX] Could not fetch company DID document at ${didDocUrl}`);
      }
    } catch (fetchErr: any) {
      console.warn(`[GaiaX] DID doc self-check failed: ${fetchErr.message}`);
    }

    const vcId = `${getVCBaseUrl()}/vc/${org.id}`;
    console.log(`[GaiaX] Submitting to compliance | url=${endpointSet.compliance}/api/credential-offers/standard-compliance?vcid=${vcId}`);
    console.log(`[GaiaX]   VC count in VP = ${vcsForVP.length}`);
    console.log(`[GaiaX]   VC issuers     = ${vcsForVP.map(j => { try { return JSON.parse(Buffer.from(j.split('.')[1], 'base64url').toString()).iss; } catch { return '?'; } }).join(', ')}`);

    const complianceResult = await this.liveClient.submitCompliance(
      endpointSet.compliance,
      vpJwt,
      vcId,
    );

    attempts.push({
      id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: endpointSet.name,
      step: 'compliance',
      status: complianceResult.status === 'compliant' ? 'success' : 'error',
      durationMs: Date.now() - complianceStart,
      error: complianceResult.status !== 'compliant' ? (complianceResult.errors?.join('; ') || 'Non-compliant') : undefined,
      details: complianceResult.raw,
    });

    // If compliance issued a credential, store it
    if (complianceResult.status === 'compliant' && complianceResult.issuedCredential) {
      const complianceJwt = (complianceResult.issuedCredential as Record<string, unknown>).jwt as string | undefined;
      issuedVCs.push({
        id: `vc-compliance-${uuidv4().slice(0, 8)}`,
        type: 'ComplianceCredential',
        jwt: complianceJwt,
        json: complianceResult.issuedCredential,
        issuedAt: new Date().toISOString(),
        issuer: endpointSet.compliance,
        storedInWallet: false,
      });
    }

    this.emitProgress(org.id, 'compliance', complianceResult.status === 'compliant' ? 'completed' : 'failed');

    const finalStep = complianceResult.status === 'compliant' ? 'completed' : 'failed';
    this.emitProgress(org.id, finalStep, finalStep === 'completed' ? 'completed' : 'failed');

    return { vc, notaryResult, complianceResult, attempts, issuedVCs };
  }

  /**
   * Attempt to issue the VC via walt.id issuer-api (best-effort).
   */
  private async tryWaltIdIssuance(
    org: OrgCredentialRecord,
    vc: LegalParticipantVC,
    did: string,
  ): Promise<string | null> {
    try {
      const signer = getVPSigner();
      const offerUri = await issueCredentialOID4VCI({
        issuerDid: did,
        issuerKey: signer.getPublicKeyJwk(),
        credentialConfigurationId: 'UniversityDegree_jwt_vc_json',
        credentialData: {
          '@context': vc['@context'],
          type: vc.type,
          issuer: { id: did },
          credentialSubject: {
            id: vc.credentialSubject.id,
            legalName: vc.credentialSubject['https://schema.org/name'],
            registrationNumber: vc.credentialSubject['gx:registrationNumber'],
            legalAddress: vc.credentialSubject['gx:legalAddress'],
            headquartersAddress: vc.credentialSubject['gx:headquartersAddress'],
          },
        },
      });
      if (offerUri) {
        console.log(`[GaiaX] walt.id credential offer created: ${offerUri.slice(0, 80)}...`);
      }
      return offerUri;
    } catch (e) {
      console.warn('[GaiaX] walt.id issuance skipped:', (e as Error).message);
      return null;
    }
  }

  private emitProgress(orgId: string, step: string, status: string) {
    const callback = this.progressCallbacks.get(orgId);
    if (callback) {
      callback({
        orgCredentialId: orgId,
        currentStep: step,
        steps: [
          { name: 'Preparing & Signing VC', status: this.stepStatus(step, status, 'preparing') },
          { name: 'Notary Verification', status: this.stepStatus(step, status, 'notary') },
          { name: 'Registry Check', status: this.stepStatus(step, status, 'registry') },
          { name: 'Compliance Evaluation', status: this.stepStatus(step, status, 'compliance') },
          { name: 'Completed', status: this.stepStatus(step, status, 'completed') },
        ],
        endpointSetUsed: '',
        startedAt: new Date().toISOString(),
      });
    }
  }

  private stepStatus(currentStep: string, currentStatus: string, targetStep: string): 'pending' | 'in-progress' | 'completed' | 'failed' {
    const order = ['preparing', 'notary', 'registry', 'compliance', 'completed'];
    const currentIdx = order.indexOf(currentStep);
    const targetIdx = order.indexOf(targetStep);
    if (targetIdx < currentIdx) return 'completed';
    if (targetIdx === currentIdx) return currentStatus as 'pending' | 'in-progress' | 'completed' | 'failed';
    return 'pending';
  }
}
