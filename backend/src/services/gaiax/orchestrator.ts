import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../db';
import { GaiaXClient } from './client';
import { GaiaXLiveClient } from './live-client';
import { GaiaXMockAdapter } from './mock-adapter';
import { buildLegalParticipantVC, buildTermsAndConditionsVC, buildRegistrationNumberVC, getVCBaseUrl } from './vc-builder';
import {
  OrgCredentialRecord,
  ComplianceResult,
  NotaryResult,
  VerificationAttempt,
  VerificationProgress,
  LegalParticipantVC,
} from './types';
import {
  getCompanyWalletContext,
  storeVcInCompanyWalletViaOID4VCI,
  issueLegalParticipantVcJwtForCompany,
  issueVcJwtForCompanyWithContext,
  signComplianceVpJwtForCompany,
} from '../wallet/company-wallet-service';
import { mergeLegalParticipantVcJwtIntoIssuedVCs } from './vc-jwt-publish';
import logger from '../../lib/logger';
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
    walletCredentialIds: {
      legalParticipant: string | null;
      lrn: string | null;
      termsAndConditions: string | null;
      compliance: string | null;
    };
  }> {
    const attempts: VerificationAttempt[] = [];
    const emptyWalletIds = { legalParticipant: null, lrn: null, termsAndConditions: null, compliance: null };

    this.emitProgress(org.id, 'preparing', 'in-progress');
    const companyDid = org.did || undefined;
    const vc = buildLegalParticipantVC(org, companyDid);
    this.emitProgress(org.id, 'preparing', 'completed');

    if (this.client.isMockMode) {
      const result = await this.verifyWithMock(org, vc, attempts);
      return { ...result, walletCredentialIds: emptyWalletIds };
    }

    return this.verifyWithLive(org, vc, attempts);
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

    const companyDid = org.did!;
    const companyKidRsa = `${companyDid}#key-rsa`;

    const companyRow = await prisma.company.findUnique({
      where: { id: org.companyId },
      select: { walletProvisioned: true, rsaPublicJwk: true, rsaCertPem: true },
    });
    const rsaPub = companyRow?.rsaPublicJwk as Record<string, unknown> | null;
    const useCompanyWallet =
      companyRow?.walletProvisioned === true && rsaPub && typeof rsaPub.kty === 'string';

    if (!useCompanyWallet) {
      throw new Error(
        'Gaia-X live verification requires a provisioned company walt.id wallet (walletProvisioned, Vault at company/{companyId}/wallet, and RSA JWK cached on the company).',
      );
    }

    const rsaJwk = rsaPub as Record<string, unknown>;
    const publicKeyJwk: Record<string, unknown> = { ...rsaJwk, kid: companyKidRsa, alg: 'PS256' };

    const keyFingerprint = createHash('sha256')
      .update(JSON.stringify({ n: publicKeyJwk.n, e: publicKeyJwk.e }))
      .digest('hex').slice(0, 16);
    logger.info({
      component: 'gaiax',
      orgId: org.id,
      companyDid,
      companyKid: companyKidRsa,
      keyFingerprint,
      didDocUrl: `https://${(process.env.GAIAX_DID_DOMAIN || 'localhost:8000').replace(/%3A/g, ':')}/company/${org.companyId}/did.json`,
      endpointSet: endpointSet.name,
      complianceUrl: endpointSet.compliance,
      walletSigning: true,
      hasX5c: Boolean(companyRow?.rsaCertPem),
    }, 'Compliance submission starting');

    this.emitProgress(org.id, 'preparing', 'in-progress');

    let vcJwt: string;
    let lrnJwt: string;
    let tandcJwt: string;
    let vpJwt: string;

    const ctx = await getCompanyWalletContext(org.companyId);
    if (!ctx) {
      throw new Error('Company wallet login failed — check Vault path company/{companyId}/wallet and walt.id Wallet API');
    }
    const lp = await issueLegalParticipantVcJwtForCompany({
      companyId: org.companyId,
      companyDid,
      vcPayload: vc as unknown as Record<string, unknown>,
    });
    if (!lp) throw new Error('walt.id LegalParticipant VC issuance failed');
    vcJwt = lp.jwt;

    // Persist LP JWT for public /vc/:id/jwt resolution (GXDCH calls this during compliance).
    await mergeLegalParticipantVcJwtIntoIssuedVCs(org.id, vcJwt, companyDid);

    const lrnPayload = buildRegistrationNumberVC(companyDid, org.id, org.legalRegistrationNumber, org.legalAddress.countryCode);
    const lrn = await issueVcJwtForCompanyWithContext(ctx, companyDid, lrnPayload, rsaPub!);
    if (!lrn) throw new Error('walt.id LRN VC issuance failed');
    lrnJwt = lrn.jwt;

    const tandcPayload = buildTermsAndConditionsVC(companyDid, org.id);
    const tandc = await issueVcJwtForCompanyWithContext(ctx, companyDid, tandcPayload, rsaPub!);
    if (!tandc) throw new Error('walt.id T&C VC issuance failed');
    tandcJwt = tandc.jwt;

    // Store all VCs in the company wallet via OID4VCI (issuer API → offer → claim).
    // /credentials/import does not exist in the deployed walt.id version.
    const [lpWalletId, lrnWalletId, tandcWalletId] = await Promise.all([
      storeVcInCompanyWalletViaOID4VCI({ companyId: org.companyId, companyDid, credentialPayload: vc as unknown as Record<string, unknown> }),
      storeVcInCompanyWalletViaOID4VCI({ companyId: org.companyId, companyDid, credentialPayload: lrnPayload }),
      storeVcInCompanyWalletViaOID4VCI({ companyId: org.companyId, companyDid, credentialPayload: tandcPayload }),
    ]);

    const vp = await signComplianceVpJwtForCompany({
      companyId: org.companyId,
      companyDid,
      vcJwts: [vcJwt, lrnJwt, tandcJwt],
      vpDocumentId: `${getVCBaseUrl()}/vp/${org.id}`,
    });
    if (!vp) throw new Error('VP signing failed');
    vpJwt = vp;
    logger.info({ component: 'gaiax', companyDid, jwtLength: vcJwt.length }, 'Signed LegalParticipant VC-JWT (walt.id wallet)');


    this.emitProgress(org.id, 'preparing', 'completed');

    // ── Step 3: Call real GXDCH Notary ──
    this.emitProgress(org.id, 'notary', 'in-progress');
    const notaryStart = Date.now();
    let notaryResult: NotaryResult;

    const regEntry = this.liveClient.getNotaryType(org.legalRegistrationNumber);
    if (regEntry) {
      logger.info({ component: 'gaiax', notaryType: regEntry.type, notaryValue: regEntry.value }, 'Calling notary');
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
      logger.info({ component: 'gaiax', registryAlive: registryResult.alive }, 'Registry check');
    } catch { /* Registry is informational */ }
    this.emitProgress(org.id, 'registry', 'completed');

    // ── Step 5: Submit VP-JWT to real GXDCH Compliance ──
    this.emitProgress(org.id, 'compliance', 'in-progress');
    const complianceStart = Date.now();
    const vcsForVP = [vcJwt, lrnJwt, tandcJwt];

    // vcid = canonical `id` of the LP VC (HTTPS URL, no /jwt suffix — used by compliance to resolve the credential).
    const vcIdFromEnv = process.env.GAIAX_COMPLIANCE_VCID_URL?.trim();
    const vcId = vcIdFromEnv || `${getVCBaseUrl()}/vc/${org.id}`;
    if (vcIdFromEnv) {
      logger.info({ component: 'gaiax', orgCredId: org.id }, 'Using GAIAX_COMPLIANCE_VCID_URL override for compliance vcid');
    }

    logger.info({ component: 'gaiax', vpJwtLength: vpJwt.length, companyDid }, 'VP-JWT ready for compliance submission');
    logger.info({ component: 'gaiax', complianceUrl: `${endpointSet.compliance}/api/credential-offers/standard-compliance`, vcId, vcCountInVP: vcsForVP.length }, 'Submitting to compliance');

    // DEBUG: write VP JWT to file for inspection
    require('fs').writeFileSync('/tmp/vp_jwt_debug.txt', vpJwt);
    require('fs').writeFileSync('/tmp/vc0_debug.txt', vcsForVP[0] || '');

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

    // ComplianceCredential is issued and signed by GXDCH — we cannot re-issue it with the
    // company key nor store it via OID4VCI. The /credentials/import endpoint needed for
    // third-party JWTs is not available in the deployed walt.id version.
    // TODO: store ComplianceVC once walt.id image is updated to a version with /credentials/import.
    const complianceWalletId: string | null = null;
    if (complianceResult.status === 'compliant' && complianceResult.issuedCredential) {
      logger.info({ component: 'gaiax', orgId: org.id }, 'ComplianceCredential received from GXDCH — wallet import skipped (requires newer walt.id with /credentials/import)');
    }

    this.emitProgress(org.id, 'compliance', complianceResult.status === 'compliant' ? 'completed' : 'failed');

    const finalStep = complianceResult.status === 'compliant' ? 'completed' : 'failed';
    this.emitProgress(org.id, finalStep, finalStep === 'completed' ? 'completed' : 'failed');

    return {
      vc,
      notaryResult,
      complianceResult,
      attempts,
      walletCredentialIds: {
        legalParticipant: lpWalletId,
        lrn: lrnWalletId,
        termsAndConditions: tandcWalletId,
        compliance: complianceWalletId,
      },
    };
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
