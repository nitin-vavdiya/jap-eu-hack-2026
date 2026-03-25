import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';
import { generateBpn } from '../utils/bpn';
import { toTenantCode } from '../utils/tenantCode';
import { buildCompanyDidWeb } from '../services/did-resolver';
import { buildLegalParticipantVC } from '../services/gaiax/vc-builder';
import { getVPSigner } from '../services/gaiax/vp-signer';
import { OrgCredentialRecord } from '../services/gaiax/types';
import { GaiaXClient } from '../services/gaiax/client';
import { GaiaXOrchestrator } from '../services/gaiax/orchestrator';
import { createKeycloakUser } from '../services/keycloakAdmin';

const router = Router();

const PROVISIONING_SERVICE_URL = process.env.PROVISIONING_SERVICE_URL || 'http://localhost:3001';
const ENABLE_EDC_PROVISIONING = process.env.ENABLE_EDC_PROVISIONING === 'true';
const MAX_COMPANIES = process.env.MAX_COMPANIES ? parseInt(process.env.MAX_COMPANIES, 10) : null;

/**
 * Derive a unique tenantCode for the company name.
 * Appends "-2", "-3", … if the base slug is already taken.
 */
async function allocateTenantCode(baseName: string): Promise<string> {
  const base = toTenantCode(baseName);
  let candidate = base;
  let attempt = 2;
  while (true) {
    const existing = await prisma.company.findUnique({
      where: { tenantCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${attempt++}`;
  }
}

router.get('/', async (req, res) => {
  const companies = await prisma.company.findMany({
    include: { edcProvisioning: true, orgCredentials: true },
  });
  res.json(companies);
});

router.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: { edcProvisioning: true, orgCredentials: true },
  });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json(company);
});

/**
 * GET /companies/:id/edc-status
 * Returns the EDC provisioning status for the company.
 * UI polls this endpoint (every ~5 s) to display provisioning progress.
 */
router.get('/:id/edc-status', async (req, res) => {
  console.log(`[companies] EDC status requested for company ${req.params.id}`);
  const prov = await prisma.edcProvisioning.findUnique({
    where: { companyId: req.params.id },
  });
  if (!prov) return res.status(404).json({ error: 'No EDC provisioning record found' });
  res.json(prov);
});

/**
 * PATCH /companies/:id/edc-provisioning
 * Internal callback — called only by the provisioning microservice (not exposed publicly).
 *
 * The payload is minimal: { status, vaultPath?, provisionedAt?, lastError?, attempts? }
 * All EDC config (URLs, keys, namespaces, DB name) is derived here from the company's
 * tenantCode — so the config is never dependent on the provisioning service being reachable
 * at the exact moment the callback fires.
 */
router.patch('/:id/edc-provisioning', async (req, res) => {
  const { id } = req.params;
  const { status, attempts, lastError, vaultPath, provisionedAt } = req.body;

  console.log(`[edc-callback] ──── EDC provisioning callback for company ${id} | status=${status} ────`);

  // Derive all EDC config from tenantCode when provisioning succeeds.
  // This makes the config resilient — even if this callback had failed and been
  // retried later, the derived values are always correct and consistent.
  let derivedConfig: Record<string, string> = {};
  if (status === 'ready') {
    const company = await prisma.company.findUnique({
      where: { id },
      select: { tenantCode: true, did: true, bpn: true, name: true },
    });
    if (company?.tenantCode) {
      const t = company.tenantCode;
      const u = t.replace(/-/g, '_');
      derivedConfig = {
        managementUrl: `https://${t}-controlplane.tx.the-sense.io/management`,
        protocolUrl:   `https://${t}-protocol.tx.the-sense.io/api/v1/dsp`,
        dataplaneUrl:  `https://${t}-dataplane.tx.the-sense.io`,
        apiKey:        t,
        helmRelease:   `edc-${t}`,
        argoAppName:   `edc-${t}`,
        k8sNamespace:  `edc-${t}`,
        dbName:        `edc_${u}`,
        dbUser:        `edc_${u}`,
      };
      console.log(`[edc-callback] EDC config derived for tenantCode=${t}`);
      console.log(`[edc-callback]   protocolUrl  = ${derivedConfig.protocolUrl}`);
      console.log(`[edc-callback]   managementUrl= ${derivedConfig.managementUrl}`);
      console.log(`[edc-callback]   dataplaneUrl = ${derivedConfig.dataplaneUrl}`);
      console.log(`[edc-callback] DID document updated — DataService endpoint now live in did:web`);
      console.log(`[edc-callback]   did          = ${company.did}`);
      console.log(`[edc-callback]   serviceEndpoint = ${derivedConfig.protocolUrl}#${company.bpn}`);
    }
  } else if (status === 'failed') {
    console.error(`[edc-callback] EDC provisioning FAILED for company ${id} | error="${lastError}" attempts=${attempts}`);
  } else {
    console.log(`[edc-callback] EDC provisioning status update for company ${id} | status=${status} attempts=${attempts || 0}`);
  }

  const data = {
    status,
    ...derivedConfig,
    ...(attempts !== undefined && { attempts }),
    ...(lastError !== undefined && { lastError }),
    ...(vaultPath !== undefined && { vaultPath }),
    ...(provisionedAt !== undefined && { provisionedAt: new Date(provisionedAt) }),
  };

  try {
    await prisma.edcProvisioning.upsert({
      where: { companyId: id },
      create: { companyId: id, ...data },
      update: data,
    });
    console.log(`[edc-callback] ──── EDC callback complete for company ${id} | status=${status} ────`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[edc-callback] FAILED to update provisioning record for ${id} | error="${err.message}"`);
    res.status(500).json({ error: 'Failed to update provisioning record' });
  }
});

router.post('/', requireRole('company_admin'), async (req, res) => {
  const onboardingStart = Date.now();
  // Support both old flat field names and new wizard field names
  const {
    // Legal entity — new: legalName, old: name
    legalName, name: nameOld, adminName,
    // Registration IDs — new: taxId/localId/euid, old: gstNumber/cin
    vatId, eoriNumber, euid, leiCode,
    taxId, gstNumber,        // taxId = gstNumber alias
    localId, cin,            // localId = cin alias
    // Address — new: streetAddress/locality/postalCode/countryCode, old: address/city/country
    streetAddress, address: addressOld,
    locality, city: cityOld,
    postalCode, countryCode, countrySubdivisionCode,
    country: countryOld,
    // HQ address
    sameAsLegal,
    hqStreetAddress, hqLocality, hqPostalCode, hqCountryCode, hqCountrySubdivisionCode,
    // Contact — new: contactEmail, old: adminEmail
    contactEmail, adminEmail: adminEmailOld,
    // Admin user account (Keycloak)
    adminUserEmail,
    adminUserPassword,
    // Extra
    website,
    did: inputDid,
    validFrom: inputValidFrom,
    validUntil: inputValidUntil,
  } = req.body;

  // Normalise to internal names
  const name        = legalName || nameOld;
  const resolvedCin = localId   || cin;
  const resolvedGst = taxId     || gstNumber;
  const resolvedAddress    = streetAddress || addressOld;
  const resolvedCity       = locality      || cityOld;
  const resolvedCountry    = countryCode   || countryOld;
  const resolvedAdminEmail = contactEmail  || adminEmailOld;

  console.log(`[onboarding] ──── START company onboarding for "${name}" ────`);

  if (MAX_COMPANIES !== null) {
    const companyCount = await prisma.company.count();
    if (companyCount >= MAX_COMPANIES) {
      console.warn(`[onboarding] REJECTED — onboarding limit reached (${companyCount}/${MAX_COMPANIES})`);
      return res.status(403).json({
        error: 'ONBOARDING_LIMIT_REACHED',
        message: 'Demo capacity reached. This is a hackathon demo environment with a limited number of companies. Please contact the administrator.',
      });
    }
  }

  if (!name) return res.status(400).json({ error: 'Company name is required' });
  if (!vatId && !eoriNumber && !resolvedCin && !resolvedGst && !leiCode && !euid) {
    return res.status(400).json({ error: 'At least one of VAT ID, EORI, EUID, CIN, GST/Tax ID, LEI Code is required' });
  }

  // ── Step 1: Generate identifiers (companyId, BPN, tenantCode) ──
  const companyId = uuidv4();
  const credentialId = uuidv4();

  const bpn = generateBpn('BPNL');
  const tenantCode = await allocateTenantCode(name);
  console.log(`[onboarding] Step 1/7 — Identifiers generated | companyId=${companyId} bpn=${bpn} tenantCode=${tenantCode}`);

  // ── Step 2: Assign did:web DID ──
  const companyDid = buildCompanyDidWeb(companyId);
  console.log(`[onboarding] Step 2/7 — did:web assigned | did=${companyDid} | resolvable at /company/${companyId}/did.json`);

  // ── Step 3: Create company record in database ──
  const credentialSubject = {
    companyName: name,
    companyDid,
    registrationNumber: vatId || eoriNumber || resolvedCin || resolvedGst || leiCode || euid,
    vatId, eoriNumber, euid, leiCode,
    cin: resolvedCin, gstNumber: resolvedGst,
    country: resolvedCountry, city: resolvedCity, address: resolvedAddress,
    postalCode, countrySubdivisionCode, website,
    adminName, adminEmail: resolvedAdminEmail,
    incorporationDate: new Date().toISOString(),
  };

  const company = await prisma.company.create({
    data: {
      id: companyId,
      name,
      vatId,
      eoriNumber,
      cin: resolvedCin,
      gstNumber: resolvedGst,
      leiCode,
      country: resolvedCountry,
      city: resolvedCity,
      address: resolvedAddress,
      adminName,
      adminEmail: resolvedAdminEmail,
      did: companyDid,
      bpn,
      tenantCode,
    },
  });
  console.log(`[onboarding] Step 3/7 — Company record created in database | id=${companyId} name="${name}"`);

  // ── Step 4: Create Keycloak admin user ──
  let userCreated = false;
  let userError: string | undefined;
  if (adminUserEmail && adminUserPassword) {
    try {
      const keycloakId = await createKeycloakUser(adminUserEmail, adminUserPassword, adminName);
      await prisma.companyUser.create({ data: { keycloakId, email: adminUserEmail, companyId } });
      console.log(`[onboarding] Step 4/7 — Keycloak user created | email=${adminUserEmail} keycloakId=${keycloakId}`);
      userCreated = true;
    } catch (err: any) {
      userError = err.response?.data?.errorMessage || err.message;
      console.error(`[onboarding] Step 4/7 — Keycloak user creation FAILED | email=${adminUserEmail} error="${userError}"`);
    }
  } else {
    console.log(`[onboarding] Step 4/7 — Keycloak user skipped (no credentials provided)`);
  }

  // ── Step 5: Issue OrgVC credential ──
  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: companyId,
      companyId,
      status: 'active',
      credentialSubject,
    },
  });
  console.log(`[onboarding] Step 5/7 — OrgVC credential issued | credentialId=${credentialId}`);

  // Issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OrgVC',
    issuerDid: 'did:web:eu-dataspace',
    subjectDid: companyDid,
    credentialSubject,
  }).catch(() => {});

  // ── Step 6: Create OrgCredential + trigger Gaia-X verification ──
  const legalAddr = {
    streetAddress: resolvedAddress || '',
    locality: resolvedCity || '',
    postalCode: postalCode || '',
    countryCode: resolvedCountry || '',
    countrySubdivisionCode: countrySubdivisionCode || '',
  };
  const hqAddr = sameAsLegal === false
    ? { streetAddress: hqStreetAddress || '', locality: hqLocality || '', postalCode: hqPostalCode || '', countryCode: hqCountryCode || '', countrySubdivisionCode: hqCountrySubdivisionCode || '' }
    : legalAddr;

  const now = new Date();
  const orgCredId = uuidv4();
  const orgCredRecord: OrgCredentialRecord = {
    id: orgCredId,
    companyId,
    legalName: name,
    legalRegistrationNumber: { vatId, eoriNumber, euid, leiCode, taxId: resolvedGst, localId: resolvedCin },
    legalAddress: legalAddr,
    headquartersAddress: hqAddr,
    website: website || undefined,
    contactEmail: resolvedAdminEmail || '',
    did: companyDid,
    validFrom: inputValidFrom || now.toISOString(),
    validUntil: inputValidUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    verificationStatus: 'draft',
    verificationAttempts: [],
    issuedVCs: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const signer = getVPSigner();
  orgCredRecord.vcPayload = buildLegalParticipantVC(orgCredRecord, signer.getDid());
  orgCredRecord.vcJwt = signer.signVC(orgCredRecord.vcPayload as unknown as Record<string, unknown>);

  const orgCredential = await prisma.orgCredential.create({
    data: {
      id: orgCredRecord.id,
      companyId,
      legalName: orgCredRecord.legalName,
      legalRegistrationNumber: orgCredRecord.legalRegistrationNumber as any,
      legalAddress: orgCredRecord.legalAddress as any,
      headquartersAddress: orgCredRecord.headquartersAddress as any,
      website: orgCredRecord.website,
      contactEmail: orgCredRecord.contactEmail,
      did: orgCredRecord.did,
      validFrom: new Date(orgCredRecord.validFrom),
      validUntil: new Date(orgCredRecord.validUntil),
      verificationStatus: orgCredRecord.verificationStatus,
      verificationAttempts: orgCredRecord.verificationAttempts as any,
      vcPayload: orgCredRecord.vcPayload as any,
      vcJwt: orgCredRecord.vcJwt,
      issuedVCs: orgCredRecord.issuedVCs as any,
    },
  });
  console.log(`[onboarding] Step 6/7 — OrgCredential created | orgCredId=${orgCredId} | Gaia-X verification triggered (async)`);

  // Auto-trigger Gaia-X verification (fire-and-forget — does not block registration response)
  const orchestrator = new GaiaXOrchestrator(new GaiaXClient());
  prisma.orgCredential.update({ where: { id: orgCredId }, data: { verificationStatus: 'verifying' } })
    .then(() => {
      console.log(`[onboarding:gaia-x] Submitting OrgCredential ${orgCredId} to Gaia-X compliance service...`);
      return orchestrator.verify(orgCredRecord);
    })
    .then(async (result) => {
      const notaryOk = result.notaryResult.status === 'success';
      const complianceOk = result.complianceResult.status === 'compliant';
      const isVerified = complianceOk || notaryOk;
      await prisma.orgCredential.update({
        where: { id: orgCredId },
        data: {
          verificationStatus: isVerified ? 'verified' : 'failed',
          vcPayload: result.vc as any,
          vcJwt: getVPSigner().signVC(result.vc as unknown as Record<string, unknown>),
          complianceResult: result.complianceResult as any,
          notaryResult: result.notaryResult as any,
          issuedVCs: result.issuedVCs as any,
          verificationAttempts: result.attempts as any,
        },
      });
      console.log(`[onboarding:gaia-x] Verification complete for OrgCredential ${orgCredId} | status=${isVerified ? 'VERIFIED' : 'FAILED'} notary=${result.notaryResult.status} compliance=${result.complianceResult.status}`);
    })
    .catch((err: Error) => {
      prisma.orgCredential.update({
        where: { id: orgCredId },
        data: { verificationStatus: 'failed' },
      }).catch(() => {});
      console.error(`[onboarding:gaia-x] Verification FAILED for OrgCredential ${orgCredId} | error="${err.message}"`);
    });

  // ── Step 7: Trigger EDC provisioning ──
  if (ENABLE_EDC_PROVISIONING) {
    await prisma.edcProvisioning.create({
      data: { companyId, status: 'pending' },
    });
    console.log(`[onboarding] Step 7/7 — EDC provisioning initiated | companyId=${companyId} tenantCode=${tenantCode} status=pending`);

    axios
      .post(`${PROVISIONING_SERVICE_URL}/provision`, { companyId, tenantCode, bpn })
      .then(() => console.log(`[onboarding:edc] Provisioning request sent to ${PROVISIONING_SERVICE_URL} for tenantCode=${tenantCode}`))
      .catch(async (err) => {
        console.error(`[onboarding:edc] Provisioning request FAILED for tenantCode=${tenantCode} | error="${err.message}"`);
        await prisma.edcProvisioning.update({
          where: { companyId },
          data: { status: 'failed', lastError: `Provisioning service unreachable: ${err.message}` },
        }).catch((dbErr) =>
          console.error(`[onboarding:edc] Failed to update EDC status to failed for ${companyId} | error="${dbErr.message}"`),
        );
      });
  } else {
    console.log(`[onboarding] Step 7/7 — EDC provisioning skipped (ENABLE_EDC_PROVISIONING is not set)`);
  }

  const elapsed = Date.now() - onboardingStart;
  console.log(`[onboarding] ──── COMPLETE company onboarding for "${name}" (${elapsed}ms) ────`);
  console.log(`[onboarding]   companyId    = ${companyId}`);
  console.log(`[onboarding]   did          = ${companyDid}`);
  console.log(`[onboarding]   bpn          = ${bpn}`);
  console.log(`[onboarding]   tenantCode   = ${tenantCode}`);
  console.log(`[onboarding]   keycloak     = ${userCreated ? 'created' : userError ? `failed: ${userError}` : 'skipped'}`);
  console.log(`[onboarding]   edcEnabled   = ${ENABLE_EDC_PROVISIONING}`);
  console.log(`[onboarding]   gaia-x       = verifying (async)`);

  res.status(201).json({ company, credential, orgCredential, edcEnabled: ENABLE_EDC_PROVISIONING, userCreated, userError });
});

export default router;
