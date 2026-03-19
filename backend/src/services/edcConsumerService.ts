import axios from 'axios';

const EDC_MGMT_URL = process.env.EDC_CONSUMER_MANAGEMENT_URL || '';
const EDC_API_KEY = process.env.EDC_CONSUMER_API_KEY || '';
const PARTNER_BPN = process.env.EDC_PARTNER_BPN || '';
const PARTNER_DSP_URL = process.env.EDC_PARTNER_DSP_URL || '';

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

// Step 1: Query catalog and find asset matching VIN
export async function queryCatalog(vin: string): Promise<{ assetId: string; offerId: string }> {
  console.log(`[EDC Consumer] Querying catalog for VIN: ${vin}`);
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
      odrl: 'http://www.w3.org/ns/odrl/2/',
    },
    '@type': 'CatalogRequest',
    counterPartyAddress: PARTNER_DSP_URL,
    counterPartyId: PARTNER_BPN,
    protocol: 'dataspace-protocol-http',
    querySpec: {
      '@type': 'QuerySpec',
      offset: 0,
      limit: 100,
      filterExpression: [],
    },
  };

  console.log('[EDC Consumer] Catalog request payload:', JSON.stringify(payload, null, 2));
  const response = await axios.post(`${EDC_MGMT_URL}/v3/catalog/request`, payload, { headers, timeout: 15000 });
  console.log('[EDC Consumer] Catalog response:', JSON.stringify(response.data, null, 2));

  const datasets = response.data['dcat:dataset'];
  // dcat:dataset can be a single object or an array
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

  console.log(`[EDC Consumer] Found asset: ${assetId}, offer: ${offerId}`);
  return { assetId, offerId };
}

// Step 2: Initiate contract negotiation
export async function initiateNegotiation(offerId: string, assetId: string): Promise<string> {
  console.log(`[EDC Consumer] Initiating negotiation for asset: ${assetId}`);
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'ContractRequest',
    counterPartyAddress: PARTNER_DSP_URL,
    protocol: 'dataspace-protocol-http',
    counterPartyId: PARTNER_BPN,
    policy: {
      '@context': 'http://www.w3.org/ns/odrl.jsonld',
      '@id': offerId,
      '@type': 'odrl:Offer',
      permission: [],
      target: assetId,
      assigner: PARTNER_BPN,
    },
  };

  console.log('[EDC Consumer] Negotiation request payload:', JSON.stringify(payload, null, 2));
  const response = await axios.post(`${EDC_MGMT_URL}/v3/contractnegotiations`, payload, { headers, timeout: 10000 });
  console.log('[EDC Consumer] Negotiation response:', JSON.stringify(response.data, null, 2));
  const negotiationId = response.data['@id'];
  console.log(`[EDC Consumer] Negotiation initiated: ${negotiationId}`);
  return negotiationId;
}

// Step 3: Poll for agreement until FINALIZED
export async function waitForAgreement(negotiationId: string): Promise<string> {
  console.log(`[EDC Consumer] Waiting for agreement (initial delay: ${NEGOTIATION_INITIAL_DELAY}ms)`);
  await sleep(NEGOTIATION_INITIAL_DELAY);

  for (let attempt = 1; attempt <= NEGOTIATION_MAX_RETRIES; attempt++) {
    console.log(`[EDC Consumer] Checking negotiation status (attempt ${attempt}/${NEGOTIATION_MAX_RETRIES})`);
    const response = await axios.get(`${EDC_MGMT_URL}/v3/contractnegotiations/${negotiationId}`, {
      headers: { 'x-api-key': EDC_API_KEY },
      timeout: 10000,
    });
    console.log(`[EDC Consumer] Agreement poll response:`, JSON.stringify(response.data, null, 2));

    const state = response.data.state;
    console.log(`[EDC Consumer] Negotiation state: ${state}`);

    if (state === 'FINALIZED') {
      const agreementId = response.data.contractAgreementId;
      console.log(`[EDC Consumer] Agreement finalized: ${agreementId}`);
      return agreementId;
    }

    if (attempt < NEGOTIATION_MAX_RETRIES) {
      await sleep(NEGOTIATION_POLL_INTERVAL);
    }
  }

  throw new Error(`Contract negotiation did not finalize within ${NEGOTIATION_MAX_RETRIES} retries`);
}

// Step 4: Initiate transfer
export async function initiateTransfer(assetId: string, contractAgreementId: string): Promise<string> {
  console.log(`[EDC Consumer] Initiating transfer for asset: ${assetId}`);
  const payload = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'TransferRequest',
    assetId,
    counterPartyAddress: PARTNER_DSP_URL,
    contractId: contractAgreementId,
    protocol: 'dataspace-protocol-http',
    counterPartyId: PARTNER_BPN,
    transferType: 'HttpData-PULL',
  };

  console.log('[EDC Consumer] Transfer request payload:', JSON.stringify(payload, null, 2));
  const response = await axios.post(`${EDC_MGMT_URL}/v3/transferprocesses`, payload, { headers, timeout: 10000 });
  console.log('[EDC Consumer] Transfer response:', JSON.stringify(response.data, null, 2));
  const transferId = response.data['@id'];
  console.log(`[EDC Consumer] Transfer initiated: ${transferId}`);
  return transferId;
}

// Step 5: Get transfer process (EDR entry)
export async function getTransferProcess(contractAgreementId: string): Promise<string> {
  console.log(`[EDC Consumer] Getting transfer process for agreement: ${contractAgreementId}`);
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

  console.log('[EDC Consumer] EDR request payload:', JSON.stringify(payload, null, 2));
  const response = await axios.post(`${EDC_MGMT_URL}/v3/edrs/request`, payload, { headers, timeout: 10000 });
  console.log('[EDC Consumer] EDR response:', JSON.stringify(response.data, null, 2));
  const entries = response.data;

  if (!entries || entries.length === 0) {
    throw new Error('No EDR entry found for the agreement');
  }

  const transferId = entries[0].transferProcessId || entries[0]['@id'];
  console.log(`[EDC Consumer] Transfer process ID: ${transferId}`);
  return transferId;
}

// Step 6: Get auth code (data address with endpoint + token)
export async function getAuthCode(transferId: string): Promise<{ endpoint: string; authorization: string }> {
  console.log(`[EDC Consumer] Getting auth code for transfer: ${transferId}`);
  console.log(`[EDC Consumer] Auth code URL: ${EDC_MGMT_URL}/v2/edrs/${transferId}/dataaddress?auto_refresh=true`);
  const response = await axios.get(
    `${EDC_MGMT_URL}/v2/edrs/${transferId}/dataaddress?auto_refresh=true`,
    { headers: { 'x-api-key': EDC_API_KEY }, timeout: 10000 },
  );
  console.log('[EDC Consumer] Auth code response:', JSON.stringify(response.data, null, 2));

  const endpoint = response.data.endpoint;
  const authorization = response.data.authorization;

  if (!endpoint || !authorization) {
    throw new Error('Missing endpoint or authorization in data address response');
  }

  console.log(`[EDC Consumer] Data endpoint: ${endpoint}`);
  console.log(`[EDC Consumer] Authorization token: ${authorization.substring(0, 50)}...`);
  return { endpoint, authorization };
}

// Step 7: Fetch actual asset data from data plane
export async function fetchAssetData(endpoint: string, authorization: string): Promise<any> {
  console.log(`[EDC Consumer] Fetching asset data from: ${endpoint}`);
  console.log(`[EDC Consumer] Using authorization header: ${authorization.substring(0, 50)}...`);
  const response = await axios.get(endpoint, {
    headers: { Authorization: authorization },
    timeout: 30000,
  });
  console.log('[EDC Consumer] Asset data received:', JSON.stringify(response.data, null, 2));
  return response.data;
}

// Full orchestration: all 7 steps
export async function negotiateAndFetchData(vin: string): Promise<any> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[EDC Consumer] Starting full negotiation for VIN: ${vin}`);
  console.log(`[EDC Consumer] Config: MGMT_URL=${EDC_MGMT_URL}, PARTNER_BPN=${PARTNER_BPN}, DSP_URL=${PARTNER_DSP_URL}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Step 1
    console.log('[EDC Consumer] === Step 1: Query Catalog ===');
    const { assetId, offerId } = await queryCatalog(vin);

    // Step 2
    console.log('\n[EDC Consumer] === Step 2: Initiate Negotiation ===');
    const negotiationId = await initiateNegotiation(offerId, assetId);

    // Step 3
    console.log('\n[EDC Consumer] === Step 3: Wait for Agreement ===');
    const contractAgreementId = await waitForAgreement(negotiationId);

    // Step 4
    console.log('\n[EDC Consumer] === Step 4: Initiate Transfer ===');
    const transferId = await initiateTransfer(assetId, contractAgreementId);

    // Step 5 - small delay for transfer to register
    console.log('\n[EDC Consumer] === Step 5: Get Transfer Process ===');
    console.log('[EDC Consumer] Waiting 2s for transfer to register...');
    await sleep(2000);
    await getTransferProcess(contractAgreementId);

    // Step 6
    console.log('\n[EDC Consumer] === Step 6: Get Auth Code ===');
    const { endpoint, authorization } = await getAuthCode(transferId);

    // Step 7
    console.log('\n[EDC Consumer] === Step 7: Fetch Asset Data ===');
    const data = await fetchAssetData(endpoint, authorization);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[EDC Consumer] Negotiation COMPLETE for VIN: ${vin}`);
    console.log(`${'='.repeat(60)}\n`);

    return data;
  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`[EDC Consumer] Negotiation FAILED for VIN: ${vin}`);
    console.error(`[EDC Consumer] Error: ${error.message}`);
    if (error.response) {
      console.error(`[EDC Consumer] HTTP Status: ${error.response.status}`);
      console.error(`[EDC Consumer] Response Body:`, JSON.stringify(error.response.data, null, 2));
    }
    console.error(`${'='.repeat(60)}\n`);
    throw error;
  }
}
