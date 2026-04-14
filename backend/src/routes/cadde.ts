import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import axios from 'axios';
import logger from '../lib/logger';

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

  logger.info({ component: 'cadde', assetId, dspUrl: provider.dspUrl, bpnl: provider.bpnl }, 'Starting data transfer');

  const emit = (step: number, status: StepUpdate['status'], durationMs?: number, details?: Record<string, unknown>) => {
    if (status === 'running') {
      logger.info({ component: 'cadde', step, totalSteps: 7, stepName: STEP_NAMES[step - 1] }, 'Step STARTED');
    } else if (status === 'completed') {
      logger.info({ component: 'cadde', step, totalSteps: 7, stepName: STEP_NAMES[step - 1], durationMs, ...details }, 'Step COMPLETED');
    } else {
      logger.error({ component: 'cadde', step, totalSteps: 7, stepName: STEP_NAMES[step - 1], durationMs, ...details }, 'Step FAILED');
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

  logger.info({ component: 'cadde', url: `${EDC_MGMT_URL}/v3/catalog/request` }, 'Querying catalog');
  const catalogRes = await axios.post(`${EDC_MGMT_URL}/v3/catalog/request`, catalogPayload, { headers, timeout: 15000 });
  const datasets = catalogRes.data['dcat:dataset'];
  const datasetList = Array.isArray(datasets) ? datasets : datasets ? [datasets] : [];
  logger.info({ component: 'cadde', assetCount: datasetList.length }, 'Catalog returned assets');
  const match = datasetList.find((ds: any) => ds['@id'] === assetId || ds.id === assetId);

  if (!match) {
    const availableIds = datasetList.map((ds: any) => ds['@id'] || ds.id).join(', ');
    logger.error({ component: 'cadde', assetId, availableIds }, 'Asset not found in catalog');
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

  logger.info({ component: 'cadde', offerId }, 'Initiating negotiation');
  const negRes = await axios.post(`${EDC_MGMT_URL}/v3/contractnegotiations`, negotiationPayload, { headers, timeout: 10000 });
  const negotiationId = negRes.data['@id'];
  emit(2, 'completed', Date.now() - t0, { negotiationId });

  // Step 3: Wait for agreement finalization
  emit(3, 'running');
  t0 = Date.now();
  logger.info({ component: 'cadde', delayMs: NEGOTIATION_INITIAL_DELAY }, 'Waiting before polling agreement status');
  await sleep(NEGOTIATION_INITIAL_DELAY);

  let contractAgreementId: string | undefined;
  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    logger.info({ component: 'cadde', attempt, maxRetries: NEGOTIATION_MAX_RETRIES }, 'Polling agreement status');
    const statusRes = await axios.get(`${EDC_MGMT_URL}/v3/contractnegotiations/${negotiationId}`, {
      headers: { 'x-api-key': EDC_API_KEY },
      timeout: 10000,
    });
    const state = statusRes.data.state;
    logger.info({ component: 'cadde', state }, 'Negotiation state');
    if (state === 'FINALIZED') {
      contractAgreementId = statusRes.data.contractAgreementId;
      break;
    }
    if (attempt < NEGOTIATION_MAX_RETRIES) {
      logger.info({ component: 'cadde', waitMs: NEGOTIATION_POLL_INTERVAL }, 'Not finalized yet, waiting before retry');
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

  logger.info({ component: 'cadde', contractAgreementId }, 'Initiating HttpData-PULL transfer');
  const transferRes = await axios.post(`${EDC_MGMT_URL}/v3/transferprocesses`, transferPayload, { headers, timeout: 10000 });
  const transferId = transferRes.data['@id'];
  emit(4, 'completed', Date.now() - t0, { transferId });

  // Step 5: Get transfer process (EDR)
  emit(5, 'running');
  t0 = Date.now();
  logger.info({ component: 'cadde' }, 'Waiting 2s before polling EDR');
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
    logger.info({ component: 'cadde', attempt, maxRetries: NEGOTIATION_MAX_RETRIES }, 'EDR poll attempt');
    const edrRes = await axios.post(`${EDC_MGMT_URL}/v3/edrs/request`, edrPayload, { headers, timeout: 10000 });
    logger.info({ component: 'cadde', edrEntries: edrRes.data?.length || 0 }, 'EDR response received');
    if (edrRes.data && edrRes.data.length > 0) {
      edrTransferId = edrRes.data[0].transferProcessId || edrRes.data[0]['@id'];
      break;
    }
    if (attempt < NEGOTIATION_MAX_RETRIES) {
      logger.info({ component: 'cadde', waitMs: NEGOTIATION_POLL_INTERVAL }, 'No EDR yet, waiting before retry');
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
  logger.info({ component: 'cadde', transferId: edrTransferId }, 'Fetching data address for transfer');
  const authRes = await axios.get(
    `${EDC_MGMT_URL}/v2/edrs/${edrTransferId}/dataaddress?auto_refresh=true`,
    { headers: { 'x-api-key': EDC_API_KEY }, timeout: 10000 },
  );

  const endpoint = authRes.data.endpoint;
  const authorization = authRes.data.authorization;
  if (!endpoint || !authorization) {
    logger.error({ component: 'cadde' }, 'Missing endpoint or authorization in data address response');
    emit(6, 'failed', Date.now() - t0, { error: 'Missing endpoint or authorization' });
    throw new Error('Missing endpoint or authorization in data address response');
  }
  logger.info({ component: 'cadde', dataPlaneEndpoint: endpoint }, 'Data plane endpoint resolved');
  emit(6, 'completed', Date.now() - t0, { dataPlaneEndpoint: endpoint });

  // Step 7: Fetch asset data
  emit(7, 'running');
  t0 = Date.now();
  logger.info({ component: 'cadde', dataPlaneEndpoint: endpoint }, 'Fetching data from data plane');
  const dataRes = await axios.get(endpoint, {
    headers: { Authorization: authorization },
    timeout: 30000,
  });
  const recordCount = Array.isArray(dataRes.data) ? dataRes.data.length : 1;
  logger.info({ component: 'cadde', recordCount }, 'Data fetched');
  emit(7, 'completed', Date.now() - t0, { records: recordCount });

  const totalDuration = Date.now() - globalStart;
  logger.info({ component: 'cadde', totalDurationMs: totalDuration, recordCount }, 'Transfer complete');

  return dataRes.data;
}

// SSE streaming endpoint
router.post('/transfer', authenticate, async (req, res) => {
  const { stream } = req.body;

  req.log.info({ component: 'cadde', stream: !!stream }, 'POST /transfer');

  if (!CADDE_ASSET_ID || !CADDE_PARTNER_EDC_DSP_URL || !CADDE_PARTNER_EDC_BPN) {
    req.log.error({ component: 'cadde', hasCaddeAssetId: !!CADDE_ASSET_ID, hasDspUrl: !!CADDE_PARTNER_EDC_DSP_URL, hasBpn: !!CADDE_PARTNER_EDC_BPN }, 'Missing CADDE environment variables');
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
      req.log.error({ component: 'cadde', err: err.message }, 'Streaming transfer failed');
      sendEvent('error', { error: err.message });
      res.end();
    }
    return;
  }

  try {
    const data = await caddeTransfer();
    res.json(data);
  } catch (err: any) {
    req.log.error({ component: 'cadde', err: err.message }, 'Transfer failed');
    res.status(502).json({ error: 'CADDE data transfer failed', details: err.message });
  }
});

export default router;
