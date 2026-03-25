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
  console.log(`[edc-callback] Provisioning status update for company ${id}:`, req.body.status);

  const { status, attempts, lastError, vaultPath, provisionedAt } = req.body;

  // Derive all EDC config from tenantCode when provisioning succeeds.
  // This makes the config resilient — even if this callback had failed and been
  // retried later, the derived values are always correct and consistent.
  let derivedConfig = {};
  if (status === 'ready') {
    const company = await prisma.company.findUnique({
      where: { id },
      select: { tenantCode: true },
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
    }
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
    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[edc-callback] Failed to update provisioning record for ${id}:`, err.message);
    res.status(500).json({ error: 'Failed to update provisioning record' });
  }
});

router.post('/', requireRole('company_admin'), async (req, res) => {
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

  if (MAX_COMPANIES !== null) {
    const companyCount = await prisma.company.count();
    if (companyCount >= MAX_COMPANIES) {
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

  const companyId = uuidv4();
  const credentialId = uuidv4();

  // Generate BPN (BPNL + 12 CSPRNG alphanumeric chars)
  const bpn = generateBpn('BPNL');
  console.log(`[onboarding] Generated BPN ${bpn} for company "${name}"`);

  // Derive unique tenant code
  const tenantCode = await allocateTenantCode(name);
  console.log(`[onboarding] Assigned tenantCode "${tenantCode}" for company "${name}"`);

  // Always assign a did:web DID — resolvable at /company/<companyId>/did.json
  // Ignore any user-provided DID; the system manages did:web identifiers
  const companyDid = buildCompanyDidWeb(companyId);

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
  console.log(`[onboarding] Assigned did:web DID "${companyDid}" for company "${name}"`);

  // Create Keycloak user and store the mapping
  let userCreated = false;
  let userError: string | undefined;
  if (adminUserEmail && adminUserPassword) {
    try {
      const keycloakId = await createKeycloakUser(adminUserEmail, adminUserPassword, adminName);
      await prisma.companyUser.create({ data: { keycloakId, email: adminUserEmail, companyId } });
      console.log(`[onboarding] Keycloak user ${adminUserEmail} (${keycloakId}) linked to company ${companyId}`);
      userCreated = true;
    } catch (err: any) {
      userError = err.response?.data?.errorMessage || err.message;
      console.error(`[onboarding] Keycloak user creation failed: ${userError}`);
    }
  }

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

  // Issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OrgVC',
    issuerDid: 'did:web:eu-dataspace',
    subjectDid: companyDid,
    credentialSubject,
  }).catch(() => {});

  // Build resolved address objects for OrgCredential
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
  orgCredRecord.vcPayload = buildLegalParticipantVC(orgCredRecord);
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
  console.log(`[onboarding] Auto-created OrgCredential ${orgCredId} for company "${name}"`);

  // Auto-trigger Gaia-X verification (fire-and-forget — does not block registration response)
  const orchestrator = new GaiaXOrchestrator(new GaiaXClient());
  prisma.orgCredential.update({ where: { id: orgCredId }, data: { verificationStatus: 'verifying' } })
    .then(() => orchestrator.verify(orgCredRecord))
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
      console.log(`[onboarding] Gaia-X verification complete for OrgCredential ${orgCredId}: ${isVerified ? 'verified' : 'failed'}`);
    })
    .catch((err: Error) => {
      prisma.orgCredential.update({
        where: { id: orgCredId },
        data: { verificationStatus: 'failed' },
      }).catch(() => {});
      console.error(`[onboarding] Gaia-X verification failed for OrgCredential ${orgCredId}:`, err.message);
    });

  if (ENABLE_EDC_PROVISIONING) {
    // Create initial EDC provisioning record (status: pending)
    await prisma.edcProvisioning.create({
      data: { companyId, status: 'pending' },
    });
    console.log(`[onboarding] Created EDC provisioning record for company ${companyId} (status: pending)`);

    // Trigger provisioning microservice (fire-and-forget — response returned immediately)
    console.log(`[onboarding] Triggering provisioning service for company ${companyId} (${tenantCode})`);
    axios
      .post(`${PROVISIONING_SERVICE_URL}/provision`, { companyId, tenantCode, bpn })
      .then(() => console.log(`[onboarding] Provisioning triggered successfully for ${tenantCode}`))
      .catch(async (err) => {
        console.error(`[onboarding] Provisioning trigger failed for ${tenantCode}: ${err.message}`);
        await prisma.edcProvisioning.update({
          where: { companyId },
          data: { status: 'failed', lastError: `Provisioning service unreachable: ${err.message}` },
        }).catch((dbErr) =>
          console.error(`[onboarding] Failed to update EDC status to failed for ${companyId}: ${dbErr.message}`),
        );
      });
  } else {
    console.log(`[onboarding] EDC provisioning skipped for company ${companyId} (ENABLE_EDC_PROVISIONING is not set)`);
  }

  res.status(201).json({ company, credential, orgCredential, edcEnabled: ENABLE_EDC_PROVISIONING, userCreated, userError });
});

export default router;
