import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { writeTenantSecrets } from '../services/vault';
import { generateValuesFile } from '../services/helm';
import { commitArgoApp } from '../services/argo';
import { notifyBackend } from '../services/callback';
import { withRetry } from '../utils/retry';

export const provisionRouter = Router();

// In-memory lock to prevent concurrent provisioning of the same tenant
const inProgress = new Set<string>();

/**
 * POST /provision
 * Triggers full EDC provisioning for a company.
 * Body: { companyId: string, tenantCode: string, bpn: string }
 *
 * This endpoint is INTERNAL ONLY — not exposed via public ingress.
 * Only the backend service should call this endpoint.
 *
 * Steps (all idempotent):
 *   1. Vault secret write (dbpass + vault-token)
 *   2. Helm values file generation
 *   3. Argo CD Application manifest commit + push
 *      └─ Argo CD deploys EDC + dedicated in-cluster PostgreSQL (Bitnami subchart)
 *   4. Backend callback with final status
 */
provisionRouter.post('/provision', async (req: Request, res: Response) => {
  const { companyId, tenantCode, bpn } = req.body;

  if (!companyId || !tenantCode || !bpn) {
    return res.status(400).json({ error: 'companyId, tenantCode, and bpn are required' });
  }

  if (inProgress.has(companyId)) {
    console.log(`[provision] Already in progress for company ${companyId} — ignoring duplicate`);
    return res.status(202).json({ status: 'already_in_progress' });
  }

  // Respond immediately; provisioning runs asynchronously
  res.status(202).json({ status: 'accepted', companyId, tenantCode });

  inProgress.add(companyId);
  runProvisioning(companyId, tenantCode, bpn).finally(() => inProgress.delete(companyId));
});

/**
 * GET /status/:companyId
 * Returns the current provisioning status by calling the backend.
 * Convenience endpoint for debugging; UI should call the backend directly.
 */
provisionRouter.get('/status/:companyId', async (req: Request, res: Response) => {
  res.json({
    inProgress: inProgress.has(req.params.companyId),
    note: 'For full status, call GET /companies/:id/edc-status on the backend',
  });
});

async function runProvisioning(
  companyId: string,
  tenantCode: string,
  bpn: string,
): Promise<void> {
  console.log(`[provision] ===== Starting provisioning for tenant "${tenantCode}" (${bpn}) =====`);

  // Step 0: mark provisioning started
  await notifyBackend(companyId, { status: 'provisioning', attempts: 1 });

  let vaultPath: string;

  // Step 1: Vault — write dbpass + vault-token
  // dbpass is used by the in-cluster Bitnami PostgreSQL subchart (via Vault AVP injection)
  // and by the EDC control/data plane to connect to it.
  // DB host, name, and user are deterministic from tenantCode; no need to store in Vault.
  try {
    console.log(`[provision] Step 1/3 — Vault`);
    const dbPass = randomBytes(24).toString('base64url');
    const edcVaultToken = process.env.VAULT_TOKEN || '';
    vaultPath = await withRetry(
      () =>
        writeTenantSecrets(tenantCode, {
          dbpass: dbPass,
          'vault-token': edcVaultToken,
        }),
      3, 3000, `vault:${tenantCode}`,
    );
  } catch (err: any) {
    console.error(`[provision] Step 1 FAILED for "${tenantCode}": ${err.message}`);
    await safeFail(companyId, `Vault secret write failed: ${err.message}`);
    return;
  }

  // Step 2: Helm values file
  try {
    console.log(`[provision] Step 2/3 — Helm values file`);
    await withRetry(
      () => generateValuesFile(tenantCode, bpn),
      3, 2000, `helm:${tenantCode}`,
    );
  } catch (err: any) {
    console.error(`[provision] Step 2 FAILED for "${tenantCode}": ${err.message}`);
    await safeFail(companyId, `Helm values generation failed: ${err.message}`);
    return;
  }

  // Step 3: Argo CD Application commit + push
  try {
    console.log(`[provision] Step 3/3 — Argo CD git commit`);
    await withRetry(
      () => commitArgoApp(tenantCode, bpn),
      3, 5000, `argo:${tenantCode}`,
    );
  } catch (err: any) {
    console.error(`[provision] Step 3 FAILED for "${tenantCode}": ${err.message}`);
    await safeFail(companyId, `Argo CD Application commit failed: ${err.message}`);
    return;
  }

  // Step 4: Notify backend with full status
  const managementUrl = `https://${tenantCode}-controlplane.tx.the-sense.io/management`;
  const protocolUrl = `https://${tenantCode}-protocol.tx.the-sense.io/api/v1/dsp`;
  const dataplaneUrl = `https://${tenantCode}-dataplane.tx.the-sense.io`;
  const helmRelease = `edc-${tenantCode}`;
  const argoAppName = `edc-${tenantCode}`;
  const k8sNamespace = `edc-${tenantCode}`;
  const dbName = `edc_${tenantCode.replace(/-/g, '_')}`;
  const dbUser = `edc_${tenantCode.replace(/-/g, '_')}`;

  await notifyBackend(companyId, {
    status: 'ready',
    managementUrl,
    protocolUrl,
    dataplaneUrl,
    apiKey: tenantCode,
    helmRelease,
    argoAppName,
    k8sNamespace,
    vaultPath,
    dbName,
    dbUser,
    provisionedAt: new Date().toISOString(),
  });
  console.log(`[provision] ===== Provisioning COMPLETE for tenant "${tenantCode}" =====`);
}

async function safeFail(companyId: string, message: string): Promise<void> {
  await notifyBackend(companyId, { status: 'failed', lastError: message });
}
