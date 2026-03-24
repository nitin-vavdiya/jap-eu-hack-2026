import nodeVault from 'node-vault';

export interface TenantSecrets {
  dbpass: string;
  'vault-token': string;
}

/**
 * Idempotently writes tenant EDC secrets to HashiCorp Vault (KV v2).
 * Path: k8s-stack/data/tx_edc_connector_{tenantCode}
 *
 * Secrets written:
 *   - dbpass      — PostgreSQL password used by the in-cluster Bitnami subchart and EDC
 *   - vault-token — Vault token for the EDC connector's own Vault access
 *
 * DB host, name, and user are deterministic from tenantCode and managed by Helm;
 * they do not need to be stored in Vault.
 *
 * The Vault token used must have the following policy:
 *   path "k8s-stack/data/tx_edc_connector_*" { capabilities = ["create", "update", "read"] }
 */
export async function writeTenantSecrets(
  tenantCode: string,
  secrets: TenantSecrets,
): Promise<string> {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  if (!vaultAddr) throw new Error('VAULT_ADDR is not set');
  if (!vaultToken) throw new Error('VAULT_TOKEN is not set');

  const vaultPath = `k8s-stack/data/tx_edc_connector_${tenantCode.replace(/-/g, '_')}`;
  console.log(`[vault] Writing secrets to path: ${vaultPath}`);

  const vault = nodeVault({ endpoint: vaultAddr, token: vaultToken });

  // KV v2 write — idempotent, creates new version if already exists
  await vault.write(vaultPath, { data: secrets });

  console.log(`[vault] Secrets successfully written for tenant "${tenantCode}"`);
  return vaultPath;
}
