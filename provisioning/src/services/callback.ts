import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Retry config for terminal status callbacks (ready / failed).
// Override via environment variables.
const RETRY_CONFIG = {
  maxRetries:  parseInt(process.env.CALLBACK_MAX_RETRIES  || '10', 10),
  delayMs:     parseInt(process.env.CALLBACK_RETRY_DELAY_MS || '3000', 10),
  timeoutMs:   parseInt(process.env.CALLBACK_TIMEOUT_MS   || '10000', 10),
};

export interface ProvisioningStatusPayload {
  status: 'provisioning' | 'ready' | 'failed';
  attempts?: number;
  lastError?: string;
  vaultPath?: string;
  provisionedAt?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls the backend PATCH /companies/:companyId/edc-provisioning to update status.
 *
 * - Intermediate statuses (provisioning): fire-and-forget.
 * - Terminal statuses (ready / failed): retries with a fixed delay (CALLBACK_RETRY_DELAY_MS)
 *   up to CALLBACK_MAX_RETRIES times until the backend acknowledges.
 *
 * Default retry config: 10 retries × 3s delay.
 * Override via env: CALLBACK_MAX_RETRIES, CALLBACK_RETRY_DELAY_MS, CALLBACK_TIMEOUT_MS.
 */
export async function notifyBackend(
  companyId: string,
  payload: ProvisioningStatusPayload,
): Promise<void> {
  const url = `${BACKEND_URL}/companies/${companyId}/edc-provisioning`;
  const isTerminal = payload.status === 'ready' || payload.status === 'failed';

  if (!isTerminal) {
    // Fire-and-forget for intermediate status updates
    axios
      .patch(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: RETRY_CONFIG.timeoutMs })
      .then(() => console.log(`[callback] Backend notified (${payload.status}) for ${companyId}`))
      .catch(err => console.warn(`[callback] Could not notify backend (${payload.status}) for ${companyId}: ${err.message}`));
    return;
  }

  // Terminal status — retry with fixed delay until backend confirms
  const { maxRetries, delayMs, timeoutMs } = RETRY_CONFIG;
  console.log(`[callback] Persisting "${payload.status}" for ${companyId} (max ${maxRetries} retries, ${delayMs}ms delay)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.patch(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      });
      console.log(`[callback] Backend confirmed "${payload.status}" for ${companyId} (attempt ${attempt}/${maxRetries})`);
      return;
    } catch (err: any) {
      if (attempt === maxRetries) {
        console.error(
          `[callback] Failed to persist "${payload.status}" for ${companyId} after ${maxRetries} attempts. ` +
          `Config is safe in Vault — backend can re-derive it from tenantCode.`,
        );
        return;
      }
      console.warn(`[callback] Attempt ${attempt}/${maxRetries} failed (${err.message}). Retrying in ${delayMs}ms…`);
      await sleep(delayMs);
    }
  }
}
