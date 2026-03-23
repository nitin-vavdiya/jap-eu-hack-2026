import axios from 'axios';
import prisma from '../db';

export interface EdcConfig {
  baseUrl: string;
  apiKey: string;
  appBaseUrl?: string;
}

/**
 * Look up the EDC management config for a company from the EdcProvisioning record.
 * Returns null if the EDC is not yet ready (status != "ready").
 */
export async function getEdcConfigForCompany(companyId: string): Promise<EdcConfig | null> {
  console.log(`[edcService] Looking up EDC config for company ${companyId}`);
  const prov = await prisma.edcProvisioning.findUnique({
    where: { companyId },
    select: { managementUrl: true, apiKey: true, status: true },
  });
  if (!prov || prov.status !== 'ready') {
    console.warn(
      `[edcService] EDC not ready for company ${companyId}, status: ${prov?.status ?? 'not found'}`,
    );
    return null;
  }
  return { baseUrl: prov.managementUrl!, apiKey: prov.apiKey! };
}

function buildAssetPayload(vin: string, appBaseUrl: string) {
  return {
    '@context': {
      edc: 'https://w3id.org/edc/v0.0.1/ns/',
      'cx-common': 'https://w3id.org/catenax/ontology/common#',
      'cx-taxo': 'https://w3id.org/catenax/taxonomy#',
      dct: 'https://purl.org/dc/terms/',
    },
    '@id': `asset_${vin}`,
    properties: {
      type: { '@id': 'Asset' },
    },
    dataAddress: {
      '@type': 'DataAddress',
      type: 'HttpData',
      baseUrl: `${appBaseUrl}/api/cars/${vin}`,
      proxyQueryParams: 'true',
      proxyPath: 'true',
      proxyMethod: 'true',
      proxyBody: 'true',
      method: 'POST',
    },
  };
}

export async function createAsset(
  vin: string,
  edcConfig: EdcConfig,
): Promise<any> {
  const appBaseUrl = edcConfig.appBaseUrl || process.env.APP_BASE_URL || '';
  if (!edcConfig.baseUrl) {
    throw new Error('EDC baseUrl is not configured');
  }

  const payload = buildAssetPayload(vin, appBaseUrl);
  console.log(
    `[edcService] Creating asset for VIN ${vin} on ${edcConfig.baseUrl}`,
    JSON.stringify(payload, null, 2),
  );

  try {
    const response = await axios.post(
      `${edcConfig.baseUrl}/management/v3/assets`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': edcConfig.apiKey,
        },
        timeout: 5000,
      },
    );
    console.log('[edcService] Asset created:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('[edcService] Asset creation error:', error.response?.data || error.message);
    throw new Error(
      `Failed to create asset in EDC: ${error.response?.data?.message || error.message}`,
    );
  }
}

function buildContractDefinitionPayload(
  assetId: string,
  accessPolicyId: string,
  contractPolicyId: string,
) {
  return {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'ContractDefinition',
    '@id': `contract_${assetId}`,
    accessPolicyId,
    contractPolicyId,
    assetsSelector: {
      operandLeft: 'https://w3id.org/edc/v0.0.1/ns/id',
      operator: '=',
      operandRight: assetId,
    },
  };
}

export async function createContractDefinition(
  assetId: string,
  edcConfig: EdcConfig,
  accessPolicyId?: string,
  contractPolicyId?: string,
): Promise<any> {
  const resolvedAccessPolicyId = accessPolicyId || process.env.EDC_ACCESS_POLICY_ID || '';
  const resolvedContractPolicyId = contractPolicyId || process.env.EDC_CONTRACT_POLICY_ID || '';

  const payload = buildContractDefinitionPayload(assetId, resolvedAccessPolicyId, resolvedContractPolicyId);
  console.log(
    `[edcService] Creating contract definition for asset ${assetId} on ${edcConfig.baseUrl}`,
    JSON.stringify(payload, null, 2),
  );

  try {
    const response = await axios.post(
      `${edcConfig.baseUrl}/management/v3/contractdefinitions`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': edcConfig.apiKey,
        },
        timeout: 5000,
      },
    );
    console.log('[edcService] Contract definition created:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('[edcService] Contract definition error:', error.response?.data || error.message);
    throw new Error(
      `Failed to create contract definition in EDC: ${error.response?.data?.message || error.message}`,
    );
  }
}
