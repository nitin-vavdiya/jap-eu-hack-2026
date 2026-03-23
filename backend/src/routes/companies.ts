import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';
import { generateBpn } from '../utils/bpn';
import { toTenantCode } from '../utils/tenantCode';

const router = Router();

const PROVISIONING_SERVICE_URL = process.env.PROVISIONING_SERVICE_URL || 'http://localhost:3001';

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
    include: { edcProvisioning: true },
  });
  res.json(companies);
});

router.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: { edcProvisioning: true },
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
 * Updates the EdcProvisioning record after each provisioning step or on completion/failure.
 */
router.patch('/:id/edc-provisioning', async (req, res) => {
  const { id } = req.params;
  console.log(`[edc-callback] Provisioning status update for company ${id}:`, req.body.status);

  const {
    status,
    attempts,
    lastError,
    managementUrl,
    protocolUrl,
    dataplaneUrl,
    apiKey,
    helmRelease,
    argoAppName,
    k8sNamespace,
    vaultPath,
    dbName,
    dbUser,
    provisionedAt,
  } = req.body;

  const data = {
    status,
    ...(attempts !== undefined && { attempts }),
    ...(lastError !== undefined && { lastError }),
    ...(managementUrl !== undefined && { managementUrl }),
    ...(protocolUrl !== undefined && { protocolUrl }),
    ...(dataplaneUrl !== undefined && { dataplaneUrl }),
    ...(apiKey !== undefined && { apiKey }),
    ...(helmRelease !== undefined && { helmRelease }),
    ...(argoAppName !== undefined && { argoAppName }),
    ...(k8sNamespace !== undefined && { k8sNamespace }),
    ...(vaultPath !== undefined && { vaultPath }),
    ...(dbName !== undefined && { dbName }),
    ...(dbUser !== undefined && { dbUser }),
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
  const { name, vatId, eoriNumber, cin, gstNumber, country, city, address, adminName, adminEmail } = req.body;

  if (!name) return res.status(400).json({ error: 'Company name is required' });
  if (!vatId && !eoriNumber && !cin && !gstNumber) {
    return res.status(400).json({ error: 'At least one of VAT ID, EORI, CIN, GST is required' });
  }

  const companyId = uuidv4();
  const credentialId = uuidv4();

  // Generate BPN (BPNL + 12 CSPRNG alphanumeric chars)
  const bpn = generateBpn('BPNL');
  console.log(`[onboarding] Generated BPN ${bpn} for company "${name}"`);

  // Derive unique tenant code
  const tenantCode = await allocateTenantCode(name);
  console.log(`[onboarding] Assigned tenantCode "${tenantCode}" for company "${name}"`);

  const credentialSubject = {
    companyName: name,
    companyDid: `did:eu-dataspace:${companyId}`,
    registrationNumber: vatId || eoriNumber || cin || gstNumber,
    vatId,
    eoriNumber,
    cin,
    gstNumber,
    country,
    city,
    address,
    adminName,
    adminEmail,
    incorporationDate: new Date().toISOString(),
  };

  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: companyId,
      status: 'active',
      credentialSubject,
    },
  });

  // Issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OrgVC',
    issuerDid: 'did:web:eu-dataspace',
    subjectDid: `did:eu-dataspace:${companyId}`,
    credentialSubject,
  }).catch(() => {});

  const company = await prisma.company.create({
    data: {
      id: companyId,
      name,
      vatId,
      eoriNumber,
      cin,
      gstNumber,
      country,
      city,
      address,
      adminName,
      adminEmail,
      did: `did:eu-dataspace:${companyId}`,
      credentialId,
      bpn,
      tenantCode,
    },
  });

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
    .catch((err) =>
      console.error(`[onboarding] Provisioning trigger failed for ${tenantCode}: ${err.message}`),
    );

  res.status(201).json({ company, credential });
});

export default router;
