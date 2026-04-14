import 'dotenv/config';
import { validateEnv } from './utils/validateEnv';
import { execSync } from 'child_process';
import path from 'path';
import express from 'express';
import cors from 'cors';
import logger from './lib/logger';
import { requestIdMiddleware } from './middleware/requestId';

// Validate required env vars before any async work (migrations, DB, external services).
// This must be the first executable statement after dotenv loads — a missing DATABASE_URL
// would otherwise produce a cryptic Prisma error instead of a clear startup message.
validateEnv();

const schemaPath = process.env.PRISMA_SCHEMA_PATH || path.resolve(__dirname, '..', 'prisma', 'schema.prisma');

logger.info({ schema: schemaPath }, 'Running pending migrations');
try {
  execSync(`npx prisma migrate deploy --schema=${schemaPath}`, { stdio: 'inherit' });
  logger.info('Migrations applied');
} catch (e) {
  logger.error({ err: e }, 'Migration failed');
  process.exit(1);
}

logger.info('Generating Prisma client');
try {
  execSync(`npx prisma generate --schema=${schemaPath}`, { stdio: 'inherit' });
  logger.info('Prisma client generated');
} catch (e) {
  logger.error({ err: e }, 'Prisma generate failed');
  process.exit(1);
}
import carsRouter from './routes/cars';
import credentialsRouter from './routes/credentials';
import consentRouter from './routes/consent';
import insuranceRouter from './routes/insurance';
import companiesRouter from './routes/companies';
import walletRouter from './routes/wallet';
import purchasesRouter from './routes/purchases';
import vcRouter from './routes/vc';
import orgCredentialsRouter from './routes/org-credentials';
import edcRouter from './routes/edc';
import caddeRouter from './routes/cadde';
import vehicleRegistryRouter from './routes/vehicle-registry';
import verifierRouter from './routes/verifier';
import walletVPRouter from './routes/wallet-vp';
import underwritingRouter from './routes/underwriting';
import usersRouter from './routes/users';
import { GaiaXClient, getVPSigner, getVPSignerAsync } from './services/gaiax';
import { buildCompanyDidDocument } from './services/did-resolver';
import prisma from './db';
import { requireRole } from './middleware/auth';
import { OrgCredentialRecord } from './services/gaiax/types';
import { buildLegalParticipantVC, buildTermsAndConditionsVC, buildRegistrationNumberVC, getVCBaseUrl } from './services/gaiax/vc-builder';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/cars', carsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/consent', consentRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/vc', vcRouter);
app.use('/api/org-credentials', orgCredentialsRouter);
app.use('/api/edc', edcRouter);
app.use('/api/cadde', caddeRouter);
app.use('/api/vehicle-registry', vehicleRegistryRouter);
app.use('/api/verifier', verifierRouter);
app.use('/api/wallet-vp', walletVPRouter);
app.use('/api/underwriting', underwritingRouter);
app.use('/api/users', usersRouter);

// Well-known endpoint for vehicle registry discovery
app.get('/.well-known/vehicle-registry', (_req, res) => {
  res.redirect('/api/vehicle-registry/well-known');
});

// DID document for did:web resolution (needed by GXDCH compliance)
// Platform's own DID document (did:web:<domain>:<path>)
const didJsonHandler = (_req: any, res: any) => {
  const signer = getVPSigner();
  res.json({
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    id: signer.getDid(),
    verificationMethod: [{
      id: signer.getKid(),
      type: 'JsonWebKey2020',
      controller: signer.getDid(),
      publicKeyJwk: signer.getPublicKeyJwk(),
    }],
    authentication: [signer.getKid()],
    assertionMethod: [signer.getKid()],
  });
};
app.get('/.well-known/did.json', didJsonHandler);

// Company did:web hosting — serves DID documents for each company
// Resolves: did:web:<domain>:company:<companyId> → GET /company/<companyId>/did.json
app.get('/company/:companyId/did.json', async (req, res) => {
  const { companyId } = req.params;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { edcProvisioning: true },
  });
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const didDocument = buildCompanyDidDocument(company, company.edcProvisioning);
  res.setHeader('Content-Type', 'application/did+ld+json');
  res.json(didDocument);
});

// Platform path-based DID resolution (e.g., did:web:<domain>:v1 → /v1/did.json)
app.get('/:path/did.json', didJsonHandler);

// VC resolution endpoints — makes VC URIs publicly resolvable
app.get('/vc/:id', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  const record = row as unknown as OrgCredentialRecord;
  const signer = getVPSigner();
  const vc = buildLegalParticipantVC(record, signer.getDid());

  const response: Record<string, unknown> = {
    ...vc,
    verificationStatus: row.verificationStatus,
  };
  if (row.complianceResult) {
    response.complianceResult = row.complianceResult;
  }
  const issuedVCs = (row.issuedVCs as any[]) || [];
  if (issuedVCs.length > 0) {
    response.issuedVCs = issuedVCs;
  }

  res.json(response);
});

app.get('/vc/:id/tandc', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  const signer = getVPSigner();
  const tandc = buildTermsAndConditionsVC(signer.getDid(), row.id);
  res.json(tandc);
});

app.get('/vc/:id/lrn', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  const record = row as unknown as OrgCredentialRecord;
  const signer = getVPSigner();
  const lrn = buildRegistrationNumberVC(signer.getDid(), row.id, record.legalRegistrationNumber, record.legalAddress.countryCode);
  res.json(lrn);
});

// Gaia-X health endpoint
app.get('/api/gaiax/health', async (_req, res) => {
  const client = new GaiaXClient();
  try {
    const healthResults = await client.checkAllHealth();
    const selected = await client.selectHealthyEndpointSet();
    res.json({
      endpointSets: healthResults,
      selectedEndpointSet: selected ? selected.endpointSet.name : null,
      mockMode: client.isMockMode,
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: 'Health check failed', message: err.message });
  }
});

// Dynamic log-level endpoint — allows changing log level at runtime without restart
const VALID_LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
app.post('/api/admin/log-level', requireRole('admin'), (req, res) => {
  const { level } = req.body as { level: string };
  if (!level || !VALID_LOG_LEVELS.has(level)) {
    return res.status(400).json({ error: 'Invalid log level' });
  }
  const previousLevel = logger.level;
  logger.level = level;
  logger.info({ component: 'admin', changedBy: req.user?.preferred_username, previousLevel, newLevel: level }, 'Log level changed');
  res.json({ ok: true, level });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Initialize VPSigner (loads keypair from DB/filesystem) before accepting requests
getVPSignerAsync()
  .then(() => {
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Backend server started');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to initialize VPSigner');
    process.exit(1);
  });
