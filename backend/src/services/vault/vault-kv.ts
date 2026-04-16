import axios from 'axios';
import logger from '../../lib/logger';

/**
 * HashiCorp Vault KV v2 read/write (JSON secrets).
 *
 * Company and operator wallet **login** material is stored only here — never in Postgres.
 * Configure `VAULT_ADDR` and `VAULT_TOKEN` (see repo `docker-compose.yml` `vault` service for local dev).
 */
export function isVaultKvConfigured(): boolean {
  const addr = process.env.VAULT_ADDR?.trim();
  const token = process.env.VAULT_TOKEN?.trim();
  return Boolean(addr && token);
}

function vaultEnabled(): boolean {
  return isVaultKvConfigured();
}

function kvMount(): string {
  return process.env.VAULT_KV_MOUNT?.trim() || 'secret';
}

/** Logical path without mount prefix, e.g. `operator/wallet` or `company/{uuid}/wallet` */
export async function vaultKvReadJson(secretPath: string): Promise<Record<string, unknown> | null> {
  if (!vaultEnabled()) return null;
  const addr = process.env.VAULT_ADDR!.replace(/\/$/, '');
  const mount = kvMount();
  const url = `${addr}/v1/${mount}/data/${secretPath}`;
  try {
    const { data } = await axios.get<{ data?: { data?: Record<string, unknown> } }>(url, {
      headers: { 'X-Vault-Token': process.env.VAULT_TOKEN },
      timeout: 15000,
    });
    const inner = data?.data?.data;
    return inner && typeof inner === 'object' ? inner : null;
  } catch (e) {
    logger.warn({ component: 'vault-kv', path: secretPath, err: (e as Error).message }, 'Vault KV read failed');
    return null;
  }
}

export async function vaultKvWriteJson(secretPath: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!vaultEnabled()) return false;
  const addr = process.env.VAULT_ADDR!.replace(/\/$/, '');
  const mount = kvMount();
  const url = `${addr}/v1/${mount}/data/${secretPath}`;
  try {
    await axios.post(
      url,
      { data: payload },
      { headers: { 'X-Vault-Token': process.env.VAULT_TOKEN }, timeout: 15000 },
    );
    logger.info({ component: 'vault-kv', path: secretPath }, 'Vault KV write ok');
    return true;
  } catch (e) {
    logger.error({ component: 'vault-kv', path: secretPath, err: (e as Error).message }, 'Vault KV write failed');
    return false;
  }
}
