import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import { GaiaXClient, getVPSigner } from './services/gaiax';
import db from './db';
import { OrgCredentialRecord } from './services/gaiax/types';
import { buildLegalParticipantVC, buildTermsAndConditionsVC, buildRegistrationNumberVC, getVCBaseUrl } from './services/gaiax/vc-builder';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), authEnabled: AUTH_ENABLED });
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

// DID document for did:web resolution (needed by GXDCH compliance)
// did:web resolution endpoints (/.well-known/did.json and /path/did.json)
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
app.get('/:path/did.json', didJsonHandler);

// VC resolution endpoints — makes VC URIs publicly resolvable
app.get('/vc/:id', (req, res) => {
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Credential not found' });

  const signer = getVPSigner();
  const vc = buildLegalParticipantVC(record, signer.getDid());

  // If compliance issued a credential, include it
  const response: Record<string, unknown> = {
    ...vc,
    verificationStatus: record.verificationStatus,
  };
  if (record.complianceResult) {
    response.complianceResult = record.complianceResult;
  }
  if (record.issuedVCs && record.issuedVCs.length > 0) {
    response.issuedVCs = record.issuedVCs;
  }

  res.json(response);
});

app.get('/vc/:id/tandc', (req, res) => {
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Credential not found' });

  const signer = getVPSigner();
  const tandc = buildTermsAndConditionsVC(signer.getDid(), record.id);
  res.json(tandc);
});

app.get('/vc/:id/lrn', (req, res) => {
  const record = db.get('org_credentials').find({ id: req.params.id }).value() as OrgCredentialRecord | undefined;
  if (!record) return res.status(404).json({ error: 'Credential not found' });

  const signer = getVPSigner();
  const lrn = buildRegistrationNumberVC(signer.getDid(), record.id, record.legalRegistrationNumber, record.legalAddress.countryCode);
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

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT} (auth: ${AUTH_ENABLED ? 'ON' : 'OFF'})`);
});
