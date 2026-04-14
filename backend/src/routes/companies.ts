import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import prisma from '../db';
import { authenticate, requireRole } from '../middleware/auth';
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
import logger from '../lib/logger';
import crypto from 'crypto';

/**
 * Returns a short SHA-256 hash of an email address for log correlation.
 * Never log raw email addresses — use this instead.
 */
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}

const router = Router();

const PROVISIONING_SERVICE_URL = process.env.PROVISIONING_SERVICE_URL || 'http://localhost:3001';
const ENABLE_EDC_PROVISIONING = process.env.ENABLE_EDC_PROVISIONING === 'true';
const MAX_COMPANIES = process.env.MAX_COMPANIES ? parseInt(process.env.MAX_COMPANIES, 10) : null;

/**
 * Middleware: validate the shared-secret token on internal provisioning callbacks.
 *
 * - Development (NODE_ENV !== 'production'): if secret is not set, log a warning and allow through.
 * - Production/staging: if secret is not set, return 503 (fail-closed — misconfiguration must be explicit).
 * - If secret is set: require X-Internal-Token header to match exactly; return 401 on mismatch.
 */
function validateProvisioningToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const secret = process.env.PROVISIONING_CALLBACK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      logger.error({ component: 'edc-callback' }, 'PROVISIONING_CALLBACK_SECRET is not set in production — refusing request (fail-closed)');
      return res.status(503).json({
        error: 'Service misconfigured',
        message: 'PROVISIONING_CALLBACK_SECRET must be set in non-development environments',
      });
    }
    // Development bypass: allow through but warn
    logger.warn({ component: 'edc-callback' }, 'PROVISIONING_CALLBACK_SECRET not set — allowing request in dev mode (set it for security)');
    return next();
  }

  const token = req.headers['x-internal-token'];
  if (token !== secret) {
    logger.warn({ component: 'edc-callback', companyId: req.params.id }, 'Invalid X-Internal-Token on provisioning callback');
    return res.status(401).json({ error: 'Invalid internal token' });
  }
  next();
}

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

router.get('/', authenticate, async (req, res) => {
  const companies = await prisma.company.findMany({
    include: { edcProvisioning: true, orgCredentials: true },
  });
  res.json(companies);
});

/**
 * GET /companies/me
 * Returns the company associated with the authenticated user via CompanyUser.keycloakId.
 * Must be registered before /:id to avoid route shadowing.
 */
router.get('/me', requireRole('company_admin'), async (req, res) => {
  const companyUser = await prisma.companyUser.findUnique({
    where: { keycloakId: req.user!.sub },
    include: {
      company: {
        include: { edcProvisioning: true, orgCredentials: true, credentials: true },
      },
      role: true,
    },
  });

  if (!companyUser) return res.status(404).json({ error: 'No company found for this user' });
  res.json({ company: companyUser.company, role: companyUser.role });
});

router.get('/:id', authenticate, async (req, res) => {
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
router.get('/:id/edc-status', authenticate, async (req, res) => {
  req.log.info({ component: 'companies', companyId: req.params.id }, 'EDC status requested');
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
router.patch('/:id/edc-provisioning', validateProvisioningToken, async (req, res) => {
  const { id } = req.params;
  const { status, attempts, lastError, vaultPath, provisionedAt } = req.body;

  req.log.info({ component: 'edc-callback', companyId: id, status }, 'EDC provisioning callback received');

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
        protocolUrl:   'https://toyota-protocol.tx.the-sense.io/api/v1/dsp#BPNL00000000024R',
        dataplaneUrl:  `https://${t}-dataplane.tx.the-sense.io`,
        apiKey:        t,
        helmRelease:   `edc-${t}`,
        argoAppName:   `edc-${t}`,
        k8sNamespace:  `edc-${t}`,
        dbName:        `edc_${u}`,
        dbUser:        `edc_${u}`,
      };
      req.log.info({ component: 'edc-callback', tenantCode: t, protocolUrl: derivedConfig.protocolUrl, managementUrl: derivedConfig.managementUrl, dataplaneUrl: derivedConfig.dataplaneUrl }, 'EDC config derived');
      req.log.info({ component: 'edc-callback', did: company.did, serviceEndpoint: `${derivedConfig.protocolUrl}#${company.bpn}` }, 'DID document updated — DataService endpoint now live in did:web');
    }
  } else if (status === 'failed') {
    req.log.error({ component: 'edc-callback', companyId: id, lastError, attempts }, 'EDC provisioning FAILED');
  } else {
    req.log.info({ component: 'edc-callback', companyId: id, status, attempts: attempts || 0 }, 'EDC provisioning status update');
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
    req.log.info({ component: 'edc-callback', companyId: id, status }, 'EDC callback complete');
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ component: 'edc-callback', companyId: id, err: err.message }, 'FAILED to update provisioning record');
    res.status(500).json({ error: 'Failed to update provisioning record' });
  }
});

/**
 * DELETE /companies/:id
 * Fully offboards a company.
 *
 * Step 1 — External resources (via provisioning service, synchronous):
 *   a. Delete Vault secrets
 *   b. Drop tenant PostgreSQL database + user
 *   c. Remove Helm values file + Argo CD Application manifest from git
 *      └─ Argo CD cascade-deletes K8s resources + namespace via finalizer
 *
 * Step 2 — Database records (only after Step 1 succeeds):
 *   WalletCredential → Credential → OrgCredential → EdcProvisioning
 *   → CompanyUser → Car (null FK) → Company
 */
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, tenantCode: true },
  });
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const { tenantCode } = company;

  // Step 1: Deprovision external resources (Vault + Postgres EDC DB + git)
  if (ENABLE_EDC_PROVISIONING && tenantCode) {
    req.log.info({ component: 'offboard', tenantCode }, 'Calling provisioning service to deprovision tenant');
    try {
      await axios.delete(`${PROVISIONING_SERVICE_URL}/deprovision`, {
        data: { companyId: id, tenantCode },
        timeout: 120_000, // git push + vault + postgres can take time
      });
      req.log.info({ component: 'offboard', tenantCode }, 'Provisioning service deprovisioned tenant');
    } catch (err: any) {
      const detail = err.response?.data?.error || err.message;
      req.log.error({ component: 'offboard', tenantCode, detail }, 'Provisioning service deprovision FAILED');
      return res.status(502).json({ error: `Deprovisioning failed: ${detail}` });
    }
  } else {
    req.log.info({ component: 'offboard' }, 'EDC provisioning disabled or no tenantCode — skipping external resource cleanup');
  }

  // Step 2: Delete database records in dependency order
  req.log.info({ component: 'offboard', companyId: id }, 'Deleting database records for company');

  // WalletCredential rows that reference this company's credentials
  const companyCredentialIds = await prisma.credential.findMany({
    where: { companyId: id },
    select: { id: true },
  });
  if (companyCredentialIds.length > 0) {
    await prisma.walletCredential.deleteMany({
      where: { credentialId: { in: companyCredentialIds.map(c => c.id) } },
    });
  }

  await prisma.credential.deleteMany({ where: { companyId: id } });
  await prisma.orgCredential.deleteMany({ where: { companyId: id } });
  await prisma.edcProvisioning.deleteMany({ where: { companyId: id } });
  await prisma.companyUser.deleteMany({ where: { companyId: id } });

  // Null out the company FK on cars rather than deleting them (cars have purchases/insurance)
  await prisma.car.updateMany({
    where: { companyId: id },
    data: { companyId: null },
  });

  await prisma.company.delete({ where: { id } });

  req.log.info({ component: 'offboard', companyId: id, companyName: company.name }, 'Company fully deleted');
  res.json({ ok: true, deleted: { companyId: id, tenantCode } });
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

  const log = req.log;
  log.info({ component: 'onboarding', companyName: name }, 'START company onboarding');

  if (MAX_COMPANIES !== null) {
    const companyCount = await prisma.company.count();
    if (companyCount >= MAX_COMPANIES) {
      log.warn({ component: 'onboarding', companyCount, maxCompanies: MAX_COMPANIES }, 'REJECTED — onboarding limit reached');
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

  // ── Duplicate guard — both checks run before any DB writes to avoid partial state ──
  // Company name: case-sensitive match for MVP (note for future: add case-insensitive index).
  const existingCompany = await prisma.company.findFirst({ where: { name } });
  if (existingCompany) {
    log.warn({ component: 'onboarding', companyName: name }, 'REJECTED — company name already registered');
    return res.status(409).json({
      error: 'COMPANY_NAME_EXISTS',
      message: `A company with the name "${name}" is already registered`,
    });
  }

  // User email: only check when adminUserEmail is provided — CompanyUser.email is nullable,
  // so querying with undefined would match null rows unexpectedly.
  if (adminUserEmail) {
    const existingUser = await prisma.companyUser.findFirst({ where: { email: adminUserEmail } });
    if (existingUser) {
      // Note: this 409 reveals whether an email is registered to any company_admin caller.
      // Acceptable for MVP (closed participant set); production should use a generic 409 or
      // restrict to platform-operator role only.
      log.warn({ component: 'onboarding', emailHash: hashEmail(adminUserEmail) }, 'REJECTED — user email already registered');
      return res.status(409).json({
        error: 'USER_EMAIL_EXISTS',
        message: 'A user with this email is already registered',
      });
    }
  }

  // ── Step 1: Generate identifiers (companyId, BPN, tenantCode) ──
  const companyId = uuidv4();
  const credentialId = uuidv4();

  const bpn = generateBpn('BPNL');
  const tenantCode = await allocateTenantCode(name);
  log.info({ component: 'onboarding', step: 1, totalSteps: 7, companyId, bpn, tenantCode }, 'Identifiers generated');

  // ── Step 2: Assign did:web DID ──
  const companyDid = buildCompanyDidWeb(companyId);
  log.info({ component: 'onboarding', step: 2, totalSteps: 7, did: companyDid, companyId }, 'did:web assigned');

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
  log.info({ component: 'onboarding', step: 3, totalSteps: 7, companyId, companyName: name }, 'Company record created in database');

  // ── Step 4: Create Keycloak admin user ──
  let userCreated = false;
  let userError: string | undefined;
  if (adminUserEmail && adminUserPassword) {
    try {
      const keycloakId = await createKeycloakUser(adminUserEmail, adminUserPassword, adminName);
      // Look up the seeded company_admin Role to link via roleId
      const companyAdminRole = await prisma.role.findUnique({ where: { name: 'company_admin' } });
      if (!companyAdminRole) {
        log.warn({ component: 'onboarding', step: 4, totalSteps: 7 }, 'company_admin role not found in DB; CompanyUser created with roleId=null');
      }
      await prisma.companyUser.create({ data: { keycloakId, email: adminUserEmail, companyId, roleId: companyAdminRole?.id ?? null } });
      log.info({ component: 'onboarding', step: 4, totalSteps: 7, emailHash: hashEmail(adminUserEmail), keycloakId, roleId: companyAdminRole?.id ?? null }, 'Keycloak user created');
      userCreated = true;
    } catch (err: any) {
      userError = err.response?.data?.errorMessage || err.message;
      log.error({ component: 'onboarding', step: 4, totalSteps: 7, emailHash: hashEmail(adminUserEmail), err: userError }, 'Keycloak user creation FAILED');
    }
  } else {
    log.info({ component: 'onboarding', step: 4, totalSteps: 7 }, 'Keycloak user skipped (no credentials provided)');
  }

  // ── Sequential gate: if user creation was attempted but FAILED, skip steps 5-7 ──
  // Distinction: "failed" (adminUserEmail provided, Keycloak call threw) is different from
  // "skipped" (no adminUserEmail provided). Only a failure blocks the remaining steps.
  // A skipped user creation still proceeds — company credentials and Gaia-X are independent.
  if (!userCreated && adminUserEmail) {
    const elapsed = Date.now() - onboardingStart;
    log.warn({ component: 'onboarding', companyId, companyName: name, elapsedMs: elapsed, keycloak: `failed: ${userError}` }, 'PARTIAL onboarding — steps 5-7 skipped due to user creation failure');
    return res.status(201).json({
      company,
      edcEnabled: ENABLE_EDC_PROVISIONING,
      userCreated: false,
      userError,
    });
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
  log.info({ component: 'onboarding', step: 5, totalSteps: 7, credentialId }, 'OrgVC credential issued');

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
  // Use company DID as issuer — company self-asserts its own identity (custodial signing)
  orgCredRecord.vcPayload = buildLegalParticipantVC(orgCredRecord, companyDid);
  orgCredRecord.vcJwt = signer.signVCAs(
    orgCredRecord.vcPayload as unknown as Record<string, unknown>,
    { did: companyDid, kid: `${companyDid}#key-1` },
  );

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
  log.info({ component: 'onboarding', step: 6, totalSteps: 7, orgCredId }, 'OrgCredential created — Gaia-X verification triggered (async)');

  // ── Step 7: Create EDC provisioning record (waiting for Gaia-X to complete) ──
  if (ENABLE_EDC_PROVISIONING) {
    await prisma.edcProvisioning.create({
      data: { companyId, status: 'pending' },
    });
    log.info({ component: 'onboarding', step: 7, totalSteps: 7, companyId, edcStatus: 'pending' }, 'EDC provisioning record created (waiting for Gaia-X)');
  } else {
    log.info({ component: 'onboarding', step: 7, totalSteps: 7 }, 'EDC provisioning skipped (ENABLE_EDC_PROVISIONING is not set)');
  }

  // Auto-trigger Gaia-X verification (fire-and-forget — does not block registration response)
  // EDC provisioning is triggered only after Gaia-X verification succeeds.
  const orchestrator = new GaiaXOrchestrator(new GaiaXClient());
  prisma.orgCredential.update({ where: { id: orgCredId }, data: { verificationStatus: 'verifying' } })
    .then(() => {
      log.info({ component: 'onboarding:gaia-x', orgCredId }, 'Submitting OrgCredential to Gaia-X compliance service');
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
          vcJwt: getVPSigner().signVCAs(
            result.vc as unknown as Record<string, unknown>,
            { did: companyDid, kid: `${companyDid}#key-1` },
          ),
          complianceResult: result.complianceResult as any,
          notaryResult: result.notaryResult as any,
          issuedVCs: result.issuedVCs as any,
          verificationAttempts: result.attempts as any,
        },
      });
      log.info({ component: 'onboarding:gaia-x', orgCredId, status: isVerified ? 'VERIFIED' : 'FAILED', notary: result.notaryResult.status, compliance: result.complianceResult.status }, 'Gaia-X verification complete');
      if (result.complianceResult.status !== 'compliant') {
        log.error({ component: 'onboarding:gaia-x', orgCredId, errors: result.complianceResult.errors || [], raw: result.complianceResult.raw }, 'Compliance errors');
      }

      if (!isVerified) {
        // Gaia-X failed — mark EDC provisioning as failed too
        if (ENABLE_EDC_PROVISIONING) {
          await prisma.edcProvisioning.update({
            where: { companyId },
            data: { status: 'failed', lastError: 'Gaia-X compliance verification failed; EDC provisioning aborted' },
          }).catch((dbErr) =>
            log.error({ component: 'onboarding:edc', companyId, err: dbErr.message }, 'Failed to update EDC status to failed'),
          );
          log.error({ component: 'onboarding:edc', companyId }, 'EDC provisioning aborted — Gaia-X not verified');
        }
        return;
      }

      // Gaia-X verified — now trigger EDC provisioning
      if (ENABLE_EDC_PROVISIONING) {
        log.info({ component: 'onboarding:edc', tenantCode }, 'Gaia-X verified — triggering EDC provisioning');
        axios
          .post(`${PROVISIONING_SERVICE_URL}/provision`, { companyId, tenantCode, bpn })
          .then(() => log.info({ component: 'onboarding:edc', tenantCode, provisioningServiceUrl: PROVISIONING_SERVICE_URL }, 'Provisioning request sent'))
          .catch(async (err) => {
            log.error({ component: 'onboarding:edc', tenantCode, err: err.message }, 'Provisioning request FAILED');
            await prisma.edcProvisioning.update({
              where: { companyId },
              data: { status: 'failed', lastError: `Provisioning service unreachable: ${err.message}` },
            }).catch((dbErr) =>
              log.error({ component: 'onboarding:edc', companyId, err: dbErr.message }, 'Failed to update EDC status to failed'),
            );
          });
      }
    })
    .catch(async (err: Error) => {
      await prisma.orgCredential.update({
        where: { id: orgCredId },
        data: { verificationStatus: 'failed' },
      }).catch(() => {});
      log.error({ component: 'onboarding:gaia-x', orgCredId, err: err.message }, 'Gaia-X verification FAILED');

      // Gaia-X threw — mark EDC provisioning as failed too
      if (ENABLE_EDC_PROVISIONING) {
        await prisma.edcProvisioning.update({
          where: { companyId },
          data: { status: 'failed', lastError: `Gaia-X verification error: ${err.message}` },
        }).catch((dbErr) =>
          log.error({ component: 'onboarding:edc', companyId, err: dbErr.message }, 'Failed to update EDC status to failed'),
        );
        log.error({ component: 'onboarding:edc', companyId }, 'EDC provisioning aborted — Gaia-X threw an error');
      }
    });

  const elapsed = Date.now() - onboardingStart;
  log.info({
    component: 'onboarding',
    companyId,
    did: companyDid,
    bpn,
    tenantCode,
    keycloak: userCreated ? 'created' : userError ? `failed: ${userError}` : 'skipped',
    edcEnabled: ENABLE_EDC_PROVISIONING,
    gaiax: 'verifying (async)',
    elapsedMs: elapsed,
  }, 'COMPLETE company onboarding');

  res.status(201).json({ company, credential, orgCredential, edcEnabled: ENABLE_EDC_PROVISIONING, userCreated, userError });
});

export default router;
