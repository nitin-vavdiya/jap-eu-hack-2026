import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import axios from 'axios';

const router = Router();

const EDC_MGMT_URL = process.env.EDC_CONSUMER_MANAGEMENT_URL || '';
const EDC_API_KEY = process.env.EDC_CONSUMER_API_KEY || '';
const CADDE_ASSET_ID = process.env.CADDE_ASSET_ID || '';
const CADDE_PARTNER_EDC_DSP_URL = process.env.CADDE_PARTNER_EDC_DSP_URL || '';
const CADDE_PARTNER_EDC_BPN = process.env.CADDE_PARTNER_EDC_BPN || '';

const NEGOTIATION_INITIAL_DELAY = parseInt(process.env.EDC_NEGOTIATION_INITIAL_DELAY_MS || '5000', 10);
const NEGOTIATION_POLL_INTERVAL = parseInt(process.env.EDC_NEGOTIATION_POLL_INTERVAL_MS || '5000', 10);
const NEGOTIATION_MAX_RETRIES = parseInt(process.env.EDC_NEGOTIATION_MAX_RETRIES || '3', 10);

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': EDC_API_KEY,
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const STEP_NAMES = [
  'Query Partner Catalog',
  'Initiate Contract Negotiation',
  'Wait for Agreement Finalization',
  'Initiate Data Transfer',
  'Get Transfer Process (EDR)',
  'Obtain Authorization Token',
  'Fetch Data from Data Plane',
];

interface StepUpdate {
  step: number;
  totalSteps: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  details?: Record<string, unknown>;
}

type ProgressCallback = (update: StepUpdate) => void;

async function caddeTransfer(onProgress?: ProgressCallback): Promise<unknown> {
  const provider = { dspUrl: CADDE_PARTNER_EDC_DSP_URL, bpnl: CADDE_PARTNER_EDC_BPN };
  const assetId = CADDE_ASSET_ID;
  const globalStart = Date.now();

  console.log(`[CADDE] Starting data transfer — asset: ${assetId}, partner DSP: ${provider.dspUrl}, partner BPN: ${provider.bpnl}`);

  const emit = (step: number, status: StepUpdate['status'], durationMs?: number, details?: Record<string, unknown>) => {
    const logDetails = details ? ` | ${JSON.stringify(details)}` : '';
    if (status === 'running') {
      console.log(`[CADDE] Step ${step}/7: ${STEP_NAMES[step - 1]} — STARTED`);
    } else if (status === 'completed') {
      console.log(`[CADDE] Step ${step}/7: ${STEP_NAMES[step - 1]} — COMPLETED (${durationMs}ms)${logDetails}`);
    } else {
      console.error(`[CADDE] Step ${step}/7: ${STEP_NAMES[step - 1]} — FAILED (${durationMs}ms)${logDetails}`);
    }
    if (onProgress) onProgress({ step, totalSteps: 7, name: STEP_NAMES[step - 1], status, durationMs, details });
  };

  // Step 1: Query catalog
  emit(1, 'running');
  let t0 = Date.now();
  const catalogPayload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
      odrl: 'http://www.w3.org/ns/odrl/2/',
    },
    '@type': 'CatalogRequest',
    counterPartyAddress: provider.dspUrl,
    counterPartyId: provider.bpnl,
    protocol: 'dataspace-protocol-http',
    querySpec: {
      '@type': 'QuerySpec',
      offset: 0,
      limit: 200,
      filterExpression: [],
    },
  };

  console.log(`[CADDE] Querying catalog at ${EDC_MGMT_URL}/v3/catalog/request`);
  const catalogRes = await axios.post(`${EDC_MGMT_URL}/v3/catalog/request`, catalogPayload, { headers, timeout: 15000 });
  const datasets = catalogRes.data['dcat:dataset'];
  const datasetList = Array.isArray(datasets) ? datasets : datasets ? [datasets] : [];
  console.log(`[CADDE] Catalog returned ${datasetList.length} assets`);
  const match = datasetList.find((ds: any) => ds['@id'] === assetId || ds.id === assetId);

  if (!match) {
    const availableIds = datasetList.map((ds: any) => ds['@id'] || ds.id).join(', ');
    console.error(`[CADDE] Asset ${assetId} not found. Available: ${availableIds}`);
    emit(1, 'failed', Date.now() - t0, { error: `Asset ${assetId} not found in catalog` });
    throw new Error(`Asset ${assetId} not found in partner catalog`);
  }

  const offerId = match['odrl:hasPolicy']?.['@id'];
  if (!offerId) {
    emit(1, 'failed', Date.now() - t0, { error: 'No offer found for asset' });
    throw new Error(`No offer found for asset: ${assetId}`);
  }
  emit(1, 'completed', Date.now() - t0, { assetId, offerId });

  // Step 2: Initiate negotiation
  emit(2, 'running');
  t0 = Date.now();
  const negotiationPayload = {
    '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
    '@type': 'ContractRequest',
    counterPartyAddress: provider.dspUrl,
    protocol: 'dataspace-protocol-http',
    counterPartyId: provider.bpnl,
    policy: {
      '@context': 'http://www.w3.org/ns/odrl.jsonld',
      '@id': offerId,
      '@type': 'odrl:Offer',
      permission: [],
      target: assetId,
      assigner: provider.bpnl,
    },
  };

  console.log(`[CADDE] Initiating negotiation with offer: ${offerId}`);
  const negRes = await axios.post(`${EDC_MGMT_URL}/v3/contractnegotiations`, negotiationPayload, { headers, timeout: 10000 });
  const negotiationId = negRes.data['@id'];
  emit(2, 'completed', Date.now() - t0, { negotiationId });

  // Step 3: Wait for agreement finalization
  emit(3, 'running');
  t0 = Date.now();
  console.log(`[CADDE] Waiting ${NEGOTIATION_INITIAL_DELAY}ms before polling agreement status...`);
  await sleep(NEGOTIATION_INITIAL_DELAY);

  let contractAgreementId: string | undefined;
  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    console.log(`[CADDE] Polling agreement status — attempt ${attempt}/${NEGOTIATION_MAX_RETRIES}`);
    const statusRes = await axios.get(`${EDC_MGMT_URL}/v3/contractnegotiations/${negotiationId}`, {
      headers: { 'x-api-key': EDC_API_KEY },
      timeout: 10000,
    });
    const state = statusRes.data.state;
    console.log(`[CADDE] Negotiation state: ${state}`);
    if (state === 'FINALIZED') {
      contractAgreementId = statusRes.data.contractAgreementId;
      break;
    }
    if (attempt < NEGOTIATION_MAX_RETRIES) {
      console.log(`[CADDE] Not finalized yet, waiting ${NEGOTIATION_POLL_INTERVAL}ms...`);
      await sleep(NEGOTIATION_POLL_INTERVAL);
    }
  }

  if (!contractAgreementId) {
    emit(3, 'failed', Date.now() - t0, { error: 'Agreement not finalized' });
    throw new Error(`Contract negotiation did not finalize within ${NEGOTIATION_MAX_RETRIES} retries`);
  }
  emit(3, 'completed', Date.now() - t0, { contractAgreementId });

  // Step 4: Initiate transfer
  emit(4, 'running');
  t0 = Date.now();
  const transferPayload = {
    '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
    '@type': 'TransferRequest',
    assetId,
    counterPartyAddress: provider.dspUrl,
    contractId: contractAgreementId,
    protocol: 'dataspace-protocol-http',
    counterPartyId: provider.bpnl,
    transferType: 'HttpData-PULL',
  };

  console.log(`[CADDE] Initiating HttpData-PULL transfer for contract: ${contractAgreementId}`);
  const transferRes = await axios.post(`${EDC_MGMT_URL}/v3/transferprocesses`, transferPayload, { headers, timeout: 10000 });
  const transferId = transferRes.data['@id'];
  emit(4, 'completed', Date.now() - t0, { transferId });

  // Step 5: Get transfer process (EDR)
  emit(5, 'running');
  t0 = Date.now();
  console.log(`[CADDE] Waiting 2s before polling EDR...`);
  await sleep(2000);
  const edrPayload = {
    '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
    '@type': 'QuerySpec',
    offset: 0,
    limit: 1,
    filterExpression: [
      { operandLeft: 'agreementId', operator: '=', operandRight: contractAgreementId },
    ],
  };

  let edrTransferId: string | undefined;
  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    console.log(`[CADDE] EDR poll attempt ${attempt}/${NEGOTIATION_MAX_RETRIES}`);
    const edrRes = await axios.post(`${EDC_MGMT_URL}/v3/edrs/request`, edrPayload, { headers, timeout: 10000 });
    console.log(`[CADDE] EDR response entries: ${edrRes.data?.length || 0}`);
    if (edrRes.data && edrRes.data.length > 0) {
      edrTransferId = edrRes.data[0].transferProcessId || edrRes.data[0]['@id'];
      break;
    }
    if (attempt < NEGOTIATION_MAX_RETRIES) {
      console.log(`[CADDE] No EDR yet, waiting ${NEGOTIATION_POLL_INTERVAL}ms...`);
      await sleep(NEGOTIATION_POLL_INTERVAL);
    }
  }

  if (!edrTransferId) {
    emit(5, 'failed', Date.now() - t0, { error: 'No EDR entry found' });
    throw new Error(`No EDR entry found after ${NEGOTIATION_MAX_RETRIES} retries`);
  }
  emit(5, 'completed', Date.now() - t0, { transferProcessId: edrTransferId });

  // Step 6: Get auth code
  emit(6, 'running');
  t0 = Date.now();
  console.log(`[CADDE] Fetching data address for transfer: ${edrTransferId}`);
  const authRes = await axios.get(
    `${EDC_MGMT_URL}/v2/edrs/${edrTransferId}/dataaddress?auto_refresh=true`,
    { headers: { 'x-api-key': EDC_API_KEY }, timeout: 10000 },
  );

  const endpoint = authRes.data.endpoint;
  const authorization = authRes.data.authorization;
  if (!endpoint || !authorization) {
    console.error(`[CADDE] Missing endpoint or authorization in data address response`);
    emit(6, 'failed', Date.now() - t0, { error: 'Missing endpoint or authorization' });
    throw new Error('Missing endpoint or authorization in data address response');
  }
  console.log(`[CADDE] Data plane endpoint: ${endpoint}`);
  emit(6, 'completed', Date.now() - t0, { dataPlaneEndpoint: endpoint });

  // Step 7: Fetch asset data
  emit(7, 'running');
  t0 = Date.now();
  console.log(`[CADDE] Fetching data from data plane: ${endpoint}`);
  const dataRes = await axios.get(endpoint, {
    headers: { Authorization: authorization },
    timeout: 30000,
  });
  const recordCount = Array.isArray(dataRes.data) ? dataRes.data.length : 1;
  console.log(`[CADDE] Data fetched — ${recordCount} records`);
  emit(7, 'completed', Date.now() - t0, { records: recordCount });

  const totalDuration = Date.now() - globalStart;
  console.log(`[CADDE] Transfer complete — total duration: ${totalDuration}ms, records: ${recordCount}`);

  return dataRes.data;
}

// SSE streaming endpoint
router.post('/transfer', authenticate, async (req, res) => {
  const { stream } = req.body;

  console.log(`[CADDE Route] POST /transfer — stream: ${!!stream}`);

  if (!CADDE_ASSET_ID || !CADDE_PARTNER_EDC_DSP_URL || !CADDE_PARTNER_EDC_BPN) {
    console.error('[CADDE Route] Missing environment variables:', {
      CADDE_ASSET_ID: !!CADDE_ASSET_ID,
      CADDE_PARTNER_EDC_DSP_URL: !!CADDE_PARTNER_EDC_DSP_URL,
      CADDE_PARTNER_EDC_BPN: !!CADDE_PARTNER_EDC_BPN,
    });
    return res.status(500).json({ error: 'CADDE environment variables not configured' });
  }

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const data = await caddeTransfer((update) => sendEvent('step', update));
      sendEvent('complete', data);
      res.end();
    } catch (err: any) {
      console.error(`[CADDE Route] Transfer failed:`, err.message);
      sendEvent('error', { error: err.message });
      res.end();
    }
    return;
  }

  try {
    const data = await caddeTransfer();
    res.json(data);
  } catch (err: any) {
    console.error(`[CADDE Route] Transfer failed:`, err.message);
    res.status(502).json({ error: 'CADDE data transfer failed', details: err.message });
  }
});

export default router;
