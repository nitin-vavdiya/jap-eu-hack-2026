import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { GaiaXClient } from '../services/gaiax/client';
import { GaiaXLiveClient } from '../services/gaiax/live-client';
import { GaiaXOrchestrator } from '../services/gaiax/orchestrator';
import { issueLegalParticipantVcJwtForCompany, storeVcInCompanyWalletViaOID4VCI } from '../services/wallet/company-wallet-service';
import { validateOrgCredentialFields, buildLegalParticipantVC, getVCBaseUrl } from '../services/gaiax/vc-builder';
import { OrgCredentialRecord } from '../services/gaiax/types';
import { listWalletCredentials } from '../services/waltid';

const router = Router();
const gaiaxClient = new GaiaXClient();
const gaiaxLiveClient = new GaiaXLiveClient();
const orchestrator = new GaiaXOrchestrator(gaiaxClient);

function toRecord(row: any): OrgCredentialRecord {
  return {
    ...row,
    legalRegistrationNumber: row.legalRegistrationNumber as any,
    legalAddress: row.legalAddress as any,
    headquartersAddress: row.headquartersAddress as any,
    verificationAttempts: (row.verificationAttempts as any) || [],
    vcPayload: row.vcPayload as any,
    walletCredentialId: row.walletCredentialId ?? undefined,
    complianceResult: row.complianceResult as any,
    notaryResult: row.notaryResult as any,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.post('/', requireRole('company_admin'), async (req: Request, res: Response) => {
  const data = req.body;
  const errors = validateOrgCredentialFields(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const id = uuidv4();
  const now = new Date();
  const companyIdForCred = data.companyId || id;
  const companyRow = await prisma.company.findUnique({
    where: { id: companyIdForCred },
    select: { walletProvisioned: true, did: true },
  });
  if (!companyRow?.walletProvisioned || !companyRow.did) {
    return res.status(400).json({
      error: 'COMPANY_WALLET_REQUIRED',
      message: 'Company must complete onboarding with a provisioned walt.id wallet before creating org credentials.',
    });
  }

  const record: OrgCredentialRecord = {
    id,
    companyId: companyIdForCred,
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
    did: data.did || companyRow.did,
    validFrom: (data.validFrom || now.toISOString()),
    validUntil: (data.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()),
    verificationStatus: 'draft',
    verificationAttempts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  record.vcPayload = buildLegalParticipantVC(record, record.did);
  const holderDid = record.did!;
  const issued = await issueLegalParticipantVcJwtForCompany({
    companyId: companyIdForCred,
    companyDid: holderDid,
    vcPayload: record.vcPayload as unknown as Record<string, unknown>,
  });
  if (!issued) {
    return res.status(502).json({ error: 'WALT_VC_ISSUANCE_FAILED', message: 'Could not issue VC via walt.id' });
  }

  // Store LP VC in wallet via OID4VCI and persist JWT for public /vc/:id/jwt URL.
  const walletCredId = await storeVcInCompanyWalletViaOID4VCI({
    companyId: companyIdForCred,
    companyDid: holderDid,
    credentialPayload: record.vcPayload as unknown as Record<string, unknown>,
  });
  record.walletCredentialId = walletCredId ?? issued.walletCredentialId;

  await prisma.orgCredential.create({
    data: {
      id: record.id,
      companyId: record.companyId,
      legalName: record.legalName,
      legalRegistrationNumber: record.legalRegistrationNumber as any,
      legalAddress: record.legalAddress as any,
      headquartersAddress: record.headquartersAddress as any,
      website: record.website,
      contactEmail: record.contactEmail,
      did: record.did,
      validFrom: new Date(record.validFrom),
      validUntil: new Date(record.validUntil),
      verificationStatus: record.verificationStatus,
      verificationAttempts: record.verificationAttempts as any,
      vcPayload: record.vcPayload as any,
      walletCredentialId: record.walletCredentialId,
      lpVcJwt: issued.jwt,
    },
  });

  res.status(201).json(record);
});

router.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.orgCredential.findMany();
  res.json(rows.map(toRecord));
});

router.get('/:id', async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Organization credential not found' });
  res.json(toRecord(row));
});

router.post('/:id/verify', requireRole('company_admin'), async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Organization credential not found' });

  const record = toRecord(row);

  await prisma.orgCredential.update({
    where: { id: req.params.id },
    data: { verificationStatus: 'verifying' },
  });

  try {
    const result = await orchestrator.verify(record);

    const notaryOk = result.notaryResult.status === 'success';
    const complianceOk = result.complianceResult.status === 'compliant';
    const isVerified = complianceOk || (notaryOk && !gaiaxClient.isMockMode);

    // walletCredentialIds.legalParticipant is the real wallet record ID returned after import.
    const lpWalletCredId = result.walletCredentialIds.legalParticipant;

    const updated = await prisma.orgCredential.update({
      where: { id: req.params.id },
      data: {
        verificationStatus: isVerified ? 'verified' : 'failed',
        vcPayload: result.vc as any,
        ...(lpWalletCredId ? { walletCredentialId: lpWalletCredId } : {}),
        complianceResult: result.complianceResult as any,
        notaryResult: result.notaryResult as any,
        verificationAttempts: [...record.verificationAttempts, ...result.attempts] as any,
      },
    });

    res.json(toRecord(updated));
  } catch (e: unknown) {
    const err = e as Error;
    await prisma.orgCredential.update({
      where: { id: req.params.id },
      data: {
        verificationStatus: 'failed',
        verificationAttempts: [
          ...record.verificationAttempts,
          { id: uuidv4(), timestamp: new Date().toISOString(), endpointSetUsed: 'none', step: 'failed', status: 'error', durationMs: 0, error: err.message },
        ] as any,
      },
    });

    res.status(500).json({ error: 'Verification failed', message: err.message });
  }
});

router.post('/:id/notary-check', requireRole('company_admin'), async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Not found' });

  const record = toRecord(row);
  if (!record.did) {
    return res.status(503).json({
      error: 'ORG_CREDENTIAL_DID_MISSING',
      message: 'Notary check requires a company DID on this org credential.',
    });
  }
  const regEntry = gaiaxLiveClient.getNotaryType(record.legalRegistrationNumber);
  if (!regEntry) {
    return res.status(400).json({ error: 'No supported registration number type (need VAT, EORI, LEI, or Tax ID)' });
  }

  const notaryUrl = 'https://registrationnumber.notary.lab.gaia-x.eu/v2';
  const result = await gaiaxLiveClient.verifyRegistrationNumber(
    notaryUrl,
    regEntry.type,
    regEntry.value,
    `${getVCBaseUrl()}/vc/${record.id}`,
    record.did,
  );

  res.json({
    registrationNumberType: regEntry.type,
    registrationNumberValue: regEntry.value,
    notaryUrl,
    ...result,
  });
});

router.get('/:id/status', async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Not found' });

  const record = toRecord(row);

  res.json({
    id: record.id,
    legalName: record.legalName,
    verificationStatus: record.verificationStatus,
    did: record.did,
    hasWalletCredential: !!record.walletCredentialId,
    walletCredentialId: record.walletCredentialId,
    hasLpVcJwt: !!(row as any).lpVcJwt,
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

router.get('/:id/proof', async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Not found' });

  const record = toRecord(row);

  res.json({
    vcPayload: record.vcPayload,
    walletCredentialId: record.walletCredentialId,
    complianceResult: record.complianceResult,
    notaryResult: record.notaryResult,
    verificationAttempts: record.verificationAttempts,
  });
});

router.get('/:id/issued-vcs', async (req: Request, res: Response) => {
  const row = await prisma.orgCredential.findUnique({
    where: { id: req.params.id },
    select: { companyId: true, did: true },
  });
  if (!row) return res.status(404).json({ error: 'Not found' });

  // Credentials live in the wallet — proxy list from walt.id wallet API.
  // Falls back to empty array if wallet is unreachable (non-fatal).
  const credentials = await listWalletCredentials().catch(() => []);
  res.json(credentials);
});

router.get('/wallet/credentials', async (_req: Request, res: Response) => {
  const credentials = await listWalletCredentials();
  res.json(credentials || []);
});

router.post('/test-verification', requireRole('company_admin'), async (req: Request, res: Response) => {
  let sampleOrg: OrgCredentialRecord;

  if (!gaiaxClient.isMockMode) {
    const companyId = (req.body as { companyId?: string } | undefined)?.companyId;
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        error: 'COMPANY_ID_REQUIRED',
        message: 'Live Gaia-X mode requires JSON body { "companyId": "<uuid>" } for a wallet-provisioned company with an org credential.',
      });
    }
    const oc = await prisma.orgCredential.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!oc) return res.status(404).json({ error: 'No org credential for this company' });
    const co = await prisma.company.findUnique({
      where: { id: companyId },
      select: { walletProvisioned: true },
    });
    if (!co?.walletProvisioned) {
      return res.status(400).json({
        error: 'COMPANY_WALLET_REQUIRED',
        message: 'Company must have walletProvisioned before live Gaia-X verification.',
      });
    }
    sampleOrg = toRecord(oc);
  } else {
    sampleOrg = {
      id: `test-${uuidv4().slice(0, 8)}`,
      companyId: 'test-company',
      legalName: 'Toyota Motor Corporation',
      legalRegistrationNumber: { vatId: 'JP-TOYOTA-VAT-2024' },
      legalAddress: { streetAddress: '1 Toyota-cho', locality: 'Toyota City', postalCode: '471-8571', countryCode: 'JP', countrySubdivisionCode: 'JP-23' },
      headquartersAddress: { streetAddress: '1 Toyota-cho', locality: 'Toyota City', postalCode: '471-8571', countryCode: 'JP', countrySubdivisionCode: 'JP-23' },
      website: 'https://www.toyota-global.com',
      contactEmail: 'admin@toyota-global.com',
      did: 'did:web:mock.local%3A8000:company:mock-gaiax-test',
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      verificationStatus: 'draft',
      verificationAttempts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

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
      walletCredentialIds: result.walletCredentialIds,
      attempts: result.attempts,
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
