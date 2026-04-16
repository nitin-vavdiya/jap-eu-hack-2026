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
import { GaiaXClient } from './services/gaiax';
import { bootstrapOperatorWallet } from './services/wallet/operator-wallet-service';
import { getPlatformOperatorDidDocument } from './services/wallet/platform-operator-did';
import { buildCompanyDidDocument, CompanyWalletNotProvisionedError } from './services/did-resolver';
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

// DID document for did:web resolution — operator walt.id wallet JWKs (no legacy VPSigner).
const didJsonHandler = async (_req: express.Request, res: express.Response) => {
  try {
    const doc = await getPlatformOperatorDidDocument();
    if (!doc) {
      return res.status(503).json({
        error: 'operator_wallet_not_ready',
        message:
          'Platform did.json requires a provisioned operator walt.id wallet and cached JWKs. Set Vault operator credentials and restart so bootstrap can run.',
      });
    }
    res.setHeader('Content-Type', 'application/did+ld+json');
    res.json(doc);
  } catch (e: unknown) {
    const err = e as Error;
    logger.error({ component: 'platform-did', err: err.message }, 'Failed to build platform DID document');
    res.status(500).json({ error: 'platform_did_failed', message: err.message });
  }
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

  try {
    const didDocument = buildCompanyDidDocument(company, company.edcProvisioning);
    res.setHeader('Content-Type', 'application/did+ld+json');
    res.json(didDocument);
  } catch (e) {
    if (e instanceof CompanyWalletNotProvisionedError) {
      return res.status(503).json({
        error: 'company_wallet_not_provisioned',
        message: 'Company walt.id wallet and cached JWKs are required before this DID document can be served.',
      });
    }
    throw e;
  }
});

// Company RSA certificate PEM endpoint — serves the company cert with proper line breaks.
// x5u in DID document publicKeyJwk points here; gx-compliance fetches this URL and parses PEM.
app.get('/company/:companyId/cert.pem', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.companyId },
    select: { rsaCertPem: true },
  });
  if (!company?.rsaCertPem) {
    return res.status(404).json({ error: 'Certificate not found' });
  }
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.send(company.rsaCertPem);
});

// Platform path-based DID resolution (e.g., did:web:<domain>:v1 → /v1/did.json)
app.get('/:path/did.json', didJsonHandler);

// VC resolution endpoints — makes VC URIs publicly resolvable
// Gaia-X compliance `vcid` must resolve to a raw VC-JWS. Content-Type must match JWT typ header.
// Our VCs use typ=vc+ld+json+jwt (VCDM 2.0 / Gaia-X ICAM), so serve application/vc+ld+json+jwt.
app.get('/vc/:id/jwt', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  if (!row.lpVcJwt) {
    return res.status(503).json({
      error: 'LEGAL_PARTICIPANT_JWT_NOT_AVAILABLE',
      message: 'Legal Participant VC-JWT is not published on this credential yet.',
    });
  }

  res.setHeader('Content-Type', 'application/vc+ld+json+jwt');
  return res.send(row.lpVcJwt);
});

app.get('/vc/:id', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  const record = row as unknown as OrgCredentialRecord;
  if (!row.did) {
    return res.status(503).json({
      error: 'ORG_CREDENTIAL_DID_MISSING',
      message: 'This credential has no company DID; complete wallet onboarding before resolving the VC document.',
    });
  }
  const vc = buildLegalParticipantVC(record, row.did);

  const response: Record<string, unknown> = {
    ...vc,
    verificationStatus: row.verificationStatus,
  };
  if (row.complianceResult) {
    response.complianceResult = row.complianceResult;
  }

  res.json(response);
});

app.get('/vc/:id/tandc', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  if (!row.did) {
    return res.status(503).json({
      error: 'ORG_CREDENTIAL_DID_MISSING',
      message: 'This credential has no company DID.',
    });
  }
  const tandc = buildTermsAndConditionsVC(row.did, row.id);
  res.json(tandc);
});

app.get('/vc/:id/lrn', async (req, res) => {
  const row = await prisma.orgCredential.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Credential not found' });

  const record = row as unknown as OrgCredentialRecord;
  if (!row.did) {
    return res.status(503).json({
      error: 'ORG_CREDENTIAL_DID_MISSING',
      message: 'This credential has no company DID.',
    });
  }
  const lrn = buildRegistrationNumberVC(row.did, row.id, record.legalRegistrationNumber, record.legalAddress.countryCode);
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

bootstrapOperatorWallet()
  .then(() => {
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Backend server started');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to bootstrap operator wallet');
    process.exit(1);
  });
