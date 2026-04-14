import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import logger from '../lib/logger';

const EDC_MGMT_URL = process.env.EDC_CONSUMER_MANAGEMENT_URL || '';
const EDC_API_KEY = process.env.EDC_CONSUMER_API_KEY || '';

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

function logCurl(method: string, url: string, hdrs: Record<string, string>, body?: unknown) {
  const headerFlags = Object.entries(hdrs)
    .map(([k, v]) => `  -H '${k}: ${v}'`)
    .join(' \\\n');
  const bodyFlag = body
    ? ` \\\n  -d '${JSON.stringify(body)}'`
    : '';
  logger.debug({ component: 'edc-consumer' }, `cURL: curl -X ${method} \\\n  '${url}' \\\n${headerFlags}${bodyFlag}`);
}

export interface EdcProviderConfig {
  dspUrl: string;
  bpnl: string;
}

export interface EdcStepUpdate {
  step: number;
  totalSteps: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface EdcTransaction {
  id: string;
  vin: string;
  consumer: { name: string; bpn: string };
  provider: { name: string; bpn: string; dspUrl: string };
  assetId?: string;
  offerId?: string;
  negotiationId?: string;
  contractAgreementId?: string;
  transferId?: string;
  status: 'running' | 'completed' | 'failed';
  steps: Array<{
    step: number;
    name: string;
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    details?: Record<string, unknown>;
  }>;
  dataCategories: string[];
  consentId?: string;
  requestedBy?: string;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  error?: string;
}

export type ProgressCallback = (update: EdcStepUpdate) => void;

const STEP_NAMES = [
  'Query Partner Catalog',
  'Initiate Contract Negotiation',
  'Wait for Agreement Finalization',
  'Initiate Data Transfer',
  'Get Transfer Process (EDR)',
  'Obtain Authorization Token',
  'Fetch DPP Data from Data Plane',
];

// Step 1: Query catalog and find asset matching VIN
export async function queryCatalog(vin: string, provider: EdcProviderConfig): Promise<{ assetId: string; offerId: string }> {
  logger.info({ component: 'edc-consumer', vin, edcMgmtUrl: EDC_MGMT_URL, providerDsp: provider.dspUrl }, 'Querying catalog');
  const payload = {
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
      limit: 100,
      filterExpression: [],
    },
  };

  logCurl('POST', `${EDC_MGMT_URL}/v3/catalog/request`, headers, payload);
  const response = await axios.post(`${EDC_MGMT_URL}/v3/catalog/request`, payload, { headers, timeout: 15000 });

  const datasets = response.data['dcat:dataset'];
  const datasetList = Array.isArray(datasets) ? datasets : datasets ? [datasets] : [];

  const assetKey = `asset_${vin}`;
  const match = datasetList.find((ds: any) => ds['@id'] === assetKey || ds.id === assetKey);

  if (!match) {
    throw new Error(`Asset not found in catalog for VIN: ${vin}`);
  }

  const assetId = match['@id'] || match.id;
  const offerId = match['odrl:hasPolicy']?.['@id'];

  if (!offerId) {
    throw new Error(`No offer found for asset: ${assetId}`);
  }

  return { assetId, offerId };
}

// Step 2: Initiate contract negotiation
export async function initiateNegotiation(offerId: string, assetId: string, provider: EdcProviderConfig): Promise<string> {
  logger.info({ component: 'edc-consumer', assetId, edcMgmtUrl: EDC_MGMT_URL, providerBpnl: provider.bpnl }, 'Initiating contract negotiation');
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
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

  logCurl('POST', `${EDC_MGMT_URL}/v3/contractnegotiations`, headers, payload);
  const response = await axios.post(`${EDC_MGMT_URL}/v3/contractnegotiations`, payload, { headers, timeout: 10000 });
  return response.data['@id'];
}

// Step 3: Poll for agreement until FINALIZED
export async function waitForAgreement(negotiationId: string): Promise<string> {
  logger.info({ component: 'edc-consumer', negotiationId, edcMgmtUrl: EDC_MGMT_URL }, 'Waiting for agreement finalization');
  await sleep(NEGOTIATION_INITIAL_DELAY);

  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    logCurl('GET', `${EDC_MGMT_URL}/v3/contractnegotiations/${negotiationId}`, { 'x-api-key': EDC_API_KEY });
    const response = await axios.get(`${EDC_MGMT_URL}/v3/contractnegotiations/${negotiationId}`, {
      headers: { 'x-api-key': EDC_API_KEY },
      timeout: 10000,
    });

    const state = response.data.state;
    if (state === 'FINALIZED') {
      return response.data.contractAgreementId;
    }

    if (attempt < NEGOTIATION_MAX_RETRIES) {
      await sleep(NEGOTIATION_POLL_INTERVAL);
    }
  }

  throw new Error(`Contract negotiation did not finalize within ${NEGOTIATION_MAX_RETRIES} retries`);
}

// Step 4: Initiate transfer
export async function initiateTransfer(assetId: string, contractAgreementId: string, provider: EdcProviderConfig): Promise<string> {
  logger.info({ component: 'edc-consumer', assetId, contractAgreementId, edcMgmtUrl: EDC_MGMT_URL }, 'Initiating data transfer');
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'TransferRequest',
    assetId,
    counterPartyAddress: provider.dspUrl,
    contractId: contractAgreementId,
    protocol: 'dataspace-protocol-http',
    counterPartyId: provider.bpnl,
    transferType: 'HttpData-PULL',
  };

  logCurl('POST', `${EDC_MGMT_URL}/v3/transferprocesses`, headers, payload);
  const response = await axios.post(`${EDC_MGMT_URL}/v3/transferprocesses`, payload, { headers, timeout: 10000 });
  return response.data['@id'];
}

// Step 5: Get transfer process (EDR entry) — polls with retries
export async function getTransferProcess(contractAgreementId: string): Promise<string> {
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'QuerySpec',
    offset: 0,
    limit: 1,
    filterExpression: [
      {
        operandLeft: 'agreementId',
        operator: '=',
        operandRight: contractAgreementId,
      },
    ],
  };

  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    logger.info({ component: 'edc-consumer', attempt, maxRetries: NEGOTIATION_MAX_RETRIES }, 'EDR poll attempt');
    logCurl('POST', `${EDC_MGMT_URL}/v3/edrs/request`, headers, payload);
    const response = await axios.post(`${EDC_MGMT_URL}/v3/edrs/request`, payload, { headers, timeout: 10000 });
    logger.debug({ component: 'edc-consumer', edrResponse: response.data }, 'EDR response received');
    const entries = response.data;

    if (entries && entries.length > 0) {
      const transferId = entries[0].transferProcessId || entries[0]['@id'];
      logger.info({ component: 'edc-consumer', transferId }, 'Transfer process ID resolved');
      return transferId;
    }

    if (attempt < NEGOTIATION_MAX_RETRIES) {
      logger.info({ component: 'edc-consumer', waitMs: NEGOTIATION_POLL_INTERVAL }, 'No EDR yet, waiting before retry');
      await sleep(NEGOTIATION_POLL_INTERVAL);
    }
  }

  throw new Error(`No EDR entry found for the agreement after ${NEGOTIATION_MAX_RETRIES} retries`);
}

// Step 6: Get auth code (data address with endpoint + token)
export async function getAuthCode(transferId: string): Promise<{ endpoint: string; authorization: string }> {
  logger.info({ component: 'edc-consumer', transferId, edcMgmtUrl: EDC_MGMT_URL }, 'Obtaining auth token for transfer');
  logCurl('GET', `${EDC_MGMT_URL}/v2/edrs/${transferId}/dataaddress?auto_refresh=true`, { 'x-api-key': EDC_API_KEY });
  const response = await axios.get(
    `${EDC_MGMT_URL}/v2/edrs/${transferId}/dataaddress?auto_refresh=true`,
    { headers: { 'x-api-key': EDC_API_KEY }, timeout: 10000 },
  );

  const endpoint = response.data.endpoint;
  const authorization = response.data.authorization;

  if (!endpoint || !authorization) {
    throw new Error('Missing endpoint or authorization in data address response');
  }

  return { endpoint, authorization };
}

// Step 7: Fetch actual asset data from data plane
export async function fetchAssetData(endpoint: string, authorization: string): Promise<any> {
  logger.info({ component: 'edc-consumer', dataPlaneEndpoint: endpoint }, 'Fetching asset data from data plane');
  logCurl('GET', endpoint, { Authorization: authorization });
  const response = await axios.get(endpoint, {
    headers: { Authorization: authorization },
    timeout: 30000,
  });
  return response.data;
}

// Full orchestration with progress callbacks and transaction logging
export async function negotiateAndFetchData(
  vin: string,
  provider: EdcProviderConfig,
  onProgress?: ProgressCallback,
  meta?: { consentId?: string; requestedBy?: string },
): Promise<any> {
  const txId = uuidv4();
  const tx: EdcTransaction = {
    id: txId,
    vin,
    consumer: { name: 'Tokio Marine', bpn: process.env.BPN_NUMBER || 'BPNL_CONSUMER' },
    provider: { name: 'Provider', bpn: provider.bpnl, dspUrl: provider.dspUrl },
    status: 'running',
    steps: [],
    dataCategories: [
      'Vehicle Identity',
      'State of Health',
      'Damage History',
      'Service History',
      'Ownership Chain',
      'Compliance Records',
    ],
    consentId: meta?.consentId,
    requestedBy: meta?.requestedBy,
    startedAt: new Date().toISOString(),
  };

  // Persist initial transaction
  await prisma.edcTransaction.create({ data: tx as any });

  const emitStep = async (step: number, status: 'running' | 'completed' | 'failed', durationMs?: number, details?: Record<string, unknown>) => {
    const update: EdcStepUpdate = { step, totalSteps: 7, name: STEP_NAMES[step - 1], status, durationMs, details };
    if (onProgress) onProgress(update);

    // Update transaction record
    const existing = tx.steps.find(s => s.step === step);
    if (existing) {
      existing.status = status;
      if (status !== 'running') {
        existing.completedAt = new Date().toISOString();
        existing.durationMs = durationMs;
      }
      if (details) existing.details = details;
    } else {
      tx.steps.push({
        step,
        name: STEP_NAMES[step - 1],
        status,
        startedAt: new Date().toISOString(),
        completedAt: status !== 'running' ? new Date().toISOString() : undefined,
        durationMs,
        details,
      });
    }
    await prisma.edcTransaction.update({ where: { id: txId }, data: tx as any });
  };

  const globalStart = Date.now();

  try {
    // Step 1
    await emitStep(1, 'running');
    let t0 = Date.now();
    const { assetId, offerId } = await queryCatalog(vin, provider);
    tx.assetId = assetId;
    tx.offerId = offerId;
    await emitStep(1, 'completed', Date.now() - t0, { assetId, offerId });

    // Step 2
    await emitStep(2, 'running');
    t0 = Date.now();
    const negotiationId = await initiateNegotiation(offerId, assetId, provider);
    tx.negotiationId = negotiationId;
    await emitStep(2, 'completed', Date.now() - t0, { negotiationId });

    // Step 3
    await emitStep(3, 'running');
    t0 = Date.now();
    const contractAgreementId = await waitForAgreement(negotiationId);
    tx.contractAgreementId = contractAgreementId;
    await emitStep(3, 'completed', Date.now() - t0, { contractAgreementId });

    // Step 4
    await emitStep(4, 'running');
    t0 = Date.now();
    const transferId = await initiateTransfer(assetId, contractAgreementId, provider);
    tx.transferId = transferId;
    await emitStep(4, 'completed', Date.now() - t0, { transferId });

    // Step 5
    await emitStep(5, 'running');
    t0 = Date.now();
    await sleep(2000);
    await getTransferProcess(contractAgreementId);
    await emitStep(5, 'completed', Date.now() - t0);

    // Step 6
    await emitStep(6, 'running');
    t0 = Date.now();
    const { endpoint, authorization } = await getAuthCode(transferId);
    await emitStep(6, 'completed', Date.now() - t0, { dataPlaneEndpoint: endpoint });

    // Step 7
    await emitStep(7, 'running');
    t0 = Date.now();
    const data = await fetchAssetData(endpoint, authorization);
    await emitStep(7, 'completed', Date.now() - t0, { fieldsReceived: Object.keys(data).length });

    // Finalize
    tx.status = 'completed';
    tx.completedAt = new Date().toISOString();
    tx.totalDurationMs = Date.now() - globalStart;
    await prisma.edcTransaction.update({ where: { id: txId }, data: tx as any });

    return data;
  } catch (error: any) {
    const failedStep = tx.steps.find(s => s.status === 'running');
    if (failedStep) {
      failedStep.status = 'failed';
      failedStep.completedAt = new Date().toISOString();
      await emitStep(failedStep.step, 'failed', undefined, { error: error.message });
    }
    tx.status = 'failed';
    tx.error = error.message;
    tx.completedAt = new Date().toISOString();
    tx.totalDurationMs = Date.now() - globalStart;
    await prisma.edcTransaction.update({ where: { id: txId }, data: tx as any });
    throw error;
  }
}
