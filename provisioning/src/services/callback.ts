import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

export interface ProvisioningStatusPayload {
  status: 'provisioning' | 'ready' | 'failed';
  attempts?: number;
  lastError?: string;
  managementUrl?: string;
  protocolUrl?: string;
  dataplaneUrl?: string;
  apiKey?: string;
  helmRelease?: string;
  argoAppName?: string;
  k8sNamespace?: string;
  vaultPath?: string;
  dbName?: string;
  dbUser?: string;
  provisionedAt?: string;
}

/**
 * Calls the backend PATCH /companies/:companyId/edc-provisioning to update provisioning state.
 * This is the only channel from provisioning service → backend.
 */
export async function notifyBackend(
  companyId: string,
  payload: ProvisioningStatusPayload,
): Promise<void> {
  const url = `${BACKEND_URL}/companies/${companyId}/edc-provisioning`;
  console.log(`[callback] Notifying backend for company ${companyId}:`, payload.status);
  try {
    await axios.patch(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[callback] Backend updated successfully for company ${companyId}`);
  } catch (err: any) {
    // Non-fatal — provisioning continues regardless of backend availability
    console.warn(
      `[callback] Could not notify backend for company ${companyId}: ${err.message} (provisioning continues)`,
    );
  }
}
