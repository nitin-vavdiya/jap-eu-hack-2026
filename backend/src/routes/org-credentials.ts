import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireRole } from '../middleware/auth';
import { GaiaXClient } from '../services/gaiax/client';
import { GaiaXLiveClient } from '../services/gaiax/live-client';
import { GaiaXOrchestrator } from '../services/gaiax/orchestrator';
import { getVPSigner } from '../services/gaiax/vp-signer';
import { validateOrgCredentialFields, buildLegalParticipantVC, getVCBaseUrl } from '../services/gaiax/vc-builder';
import { OrgCredentialRecord } from '../services/gaiax/types';
import { listWalletCredentials } from '../services/waltid';

const router = Router();
const gaiaxClient = new GaiaXClient();
const gaiaxLiveClient = new GaiaXLiveClient();
const orchestrator = new GaiaXOrchestrator(gaiaxClient);

// POST /api/org-credentials - Create org credential
router.post('/', requireRole('company_admin'), (req: Request, res: Response) => {
  const data = req.body;
  const errors = validateOrgCredentialFields(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const signer = getVPSigner();

  const record: OrgCredentialRecord = {
    id,
    companyId: data.companyId || id,
    legalName: data.legalName,
    legalRegistrationNumber: {
      vatId: data.legalRegistrationNumber?.vatId,
      eoriNumber: data.legalRegistrationNumber?.eoriNumber,
      euid: data.legalRegistrationNumber?.euid,
      leiCode: data.legalRegistrationNumber?.leiCode,
      taxId: data.legalRegistrationNumber?.taxId,
      localId: data.legalRegistrationNumber?.localId,
    },
    legalAddress: {
      streetAddress: data.legalAddress?.streetAddress || '',
      locality: data.legalAddress?.locality || '',
      postalCode: data.legalAddress?.postalCode || '',
      countryCode: data.legalAddress?.countryCode || '',
      countrySubdivisionCode: data.legalAddress?.countrySubdivisionCode || '',
    },
    headquartersAddress: {
      streetAddress: data.headquartersAddress?.streetAddress || data.legalAddress?.streetAddress || '',
      locality: data.headquartersAddress?.locality || data.legalAddress?.locality || '',
      postalCode: data.headquartersAddress?.postalCode || data.legalAddress?.postalCode || '',
      countryCode: data.headquartersAddress?.countryCode || data.legalAddress?.countryCode || '',
      countrySubdivisionCode: data.headquartersAddress?.countrySubdivisionCode || data.legalAddress?.countrySubdivisionCode || '',
    },
    website: data.website,
    contactEmail: data.contactEmail,
    did: data.did || signer.getDid(),
    validFrom: data.validFrom || now,
    validUntil: data.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    verificationStatus: 'draft',
    verificationAttempts: [],
    issuedVCs: [],
    createdAt: now,
    updatedAt: now,
  };

  record.vcPayload = buildLegalParticipantVC(record);

  // Sign the VC as JWT immediately
  record.vcJwt = signer.signVC(record.vcPayload as unknown as Record<string, unknown>);

  if (!db.has('org_credentials').value()) {
    db.set('org_credentials', []).write();
  }

  db.get('org_credentials').push(record).write();
  res.status(201).json(record);
});

// GET /api/org-credentials - List all
router.get('/', (_req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.json([]);
  }
  const records = db.get('org_credentials').value();
  res.json(records);
});

// GET /api/org-credentials/:id - Get by ID
router.get('/:id', (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value();
  if (!record) return res.status(404).json({ error: 'Organization credential not found' });
  res.json(record);
});

// POST /api/org-credentials/:id/verify - Trigger GXDCH verification (real or mock)
router.post('/:id/verify', requireRole('company_admin'), async (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Organization credential not found' });

  db.get('org_credentials').find({ id: req.params.id }).assign({
    verificationStatus: 'verifying',
    updatedAt: new Date().toISOString(),
  }).write();

  try {
    const result = await orchestrator.verify(record);

    // For real GXDCH: notary success + compliance attempt = verified (for demo)
    // In production: only compliance success = verified
    const notaryOk = result.notaryResult.status === 'success';
    const complianceOk = result.complianceResult.status === 'compliant';
    const isVerified = complianceOk || (notaryOk && !gaiaxClient.isMockMode);

    db.get('org_credentials').find({ id: req.params.id }).assign({
      verificationStatus: isVerified ? 'verified' : 'failed',
      vcPayload: result.vc,
      vcJwt: getVPSigner().signVC(result.vc as unknown as Record<string, unknown>),
      complianceResult: result.complianceResult,
      notaryResult: result.notaryResult,
      issuedVCs: [...(record.issuedVCs || []), ...result.issuedVCs],
      verificationAttempts: [...record.verificationAttempts, ...result.attempts],
      updatedAt: new Date().toISOString(),
    }).write();

    const updated = db.get('org_credentials').find({ id: req.params.id }).value();
    res.json(updated);
  } catch (e: unknown) {
    const err = e as Error;
    db.get('org_credentials').find({ id: req.params.id }).assign({
      verificationStatus: 'failed',
      verificationAttempts: [
        ...record.verificationAttempts,
        { id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: 'none', step: 'failed' as const, status: 'error' as const, durationMs: 0, error: err.message },
      ],
      updatedAt: new Date().toISOString(),
    }).write();

    res.status(500).json({ error: 'Verification failed', message: err.message });
  }
});

// POST /api/org-credentials/:id/notary-check - Check registration number via real GXDCH notary
router.post('/:id/notary-check', requireRole('company_admin'), async (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Not found' });

  const signer = getVPSigner();
  const regEntry = gaiaxLiveClient.getNotaryType(record.legalRegistrationNumber);
  if (!regEntry) {
    return res.status(400).json({ error: 'No supported registration number type (need VAT, EORI, LEI, or Tax ID)' });
  }

  // Use the lab notary directly
  const notaryUrl = 'https://registrationnumber.notary.lab.gaia-x.eu/v2';
  const result = await gaiaxLiveClient.verifyRegistrationNumber(
    notaryUrl,
    regEntry.type,
    regEntry.value,
    `${getVCBaseUrl()}/vc/${record.id}`,
    record.did || signer.getDid(),
  );

  res.json({
    registrationNumberType: regEntry.type,
    registrationNumberValue: regEntry.value,
    notaryUrl,
    ...result,
  });
});

// GET /api/org-credentials/:id/status
router.get('/:id/status', (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: record.id,
    legalName: record.legalName,
    verificationStatus: record.verificationStatus,
    did: record.did,
    hasVcJwt: !!record.vcJwt,
    issuedVCCount: record.issuedVCs?.length || 0,
    complianceResult: record.complianceResult ? {
      status: record.complianceResult.status,
      complianceLevel: record.complianceResult.complianceLevel,
      endpointSetUsed: record.complianceResult.endpointSetUsed,
      timestamp: record.complianceResult.timestamp,
    } : null,
    notaryResult: record.notaryResult ? {
      status: record.notaryResult.status,
      registrationId: record.notaryResult.registrationId,
      hasRegistrationNumberVC: !!record.notaryResult.registrationNumberVC,
      endpointSetUsed: record.notaryResult.endpointSetUsed,
    } : null,
    attemptCount: record.verificationAttempts.length,
    lastAttempt: record.verificationAttempts.length > 0
      ? record.verificationAttempts[record.verificationAttempts.length - 1]
      : null,
  });
});

// GET /api/org-credentials/:id/proof
router.get('/:id/proof', (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Not found' });

  res.json({
    vcPayload: record.vcPayload,
    vcJwt: record.vcJwt,
    complianceResult: record.complianceResult,
    notaryResult: record.notaryResult,
    issuedVCs: record.issuedVCs,
    verificationAttempts: record.verificationAttempts,
  });
});

// GET /api/org-credentials/:id/issued-vcs - List issued VCs for this credential
router.get('/:id/issued-vcs', (req: Request, res: Response) => {
  if (!db.has('org_credentials').value()) {
    return res.status(404).json({ error: 'Not found' });
  }
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Not found' });

  res.json(record.issuedVCs || []);
});

// GET /api/org-credentials/wallet/credentials - List all VCs in the walt.id wallet
router.get('/wallet/credentials', async (_req: Request, res: Response) => {
  const credentials = await listWalletCredentials();
  res.json(credentials || []);
});

// POST /api/org-credentials/test-verification
router.post('/test-verification', requireRole('company_admin'), async (_req: Request, res: Response) => {
  const sampleOrg: OrgCredentialRecord = {
    id: `test-${uuidv4().slice(0, 8)}`,
    companyId: 'test-company',
    legalName: 'TATA Motors Limited',
    // Use a known valid EU VAT for real notary verification (Google Germany GmbH)
    legalRegistrationNumber: { vatId: 'DE129274202' },
    legalAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
    headquartersAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
    website: 'https://www.tatamotors.com',
    contactEmail: 'admin@tatamotors.com',
    did: getVPSigner().getDid(),
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    verificationStatus: 'draft',
    verificationAttempts: [],
    issuedVCs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const result = await orchestrator.verify(sampleOrg);
    res.json({
      success: true,
      mockMode: gaiaxClient.isMockMode,
      did: sampleOrg.did,
      notaryStatus: result.notaryResult.status,
      notaryRegistrationNumberVC: !!result.notaryResult.registrationNumberVC,
      complianceStatus: result.complianceResult.status,
      complianceErrors: result.complianceResult.errors,
      endpointSetUsed: result.complianceResult.endpointSetUsed,
      issuedVCCount: result.issuedVCs.length,
      attempts: result.attempts,
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
