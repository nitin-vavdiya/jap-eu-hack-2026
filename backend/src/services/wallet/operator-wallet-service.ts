import prisma from '../../db';
import logger from '../../lib/logger';
import { vaultKvReadJson, vaultKvWriteJson } from '../vault/vault-kv';
import { provisionOperatorWallet } from './operator-wallet-provisioning';
import { exportWalletPrivateJwk, exportWalletPublicJwk, getWalletApiBaseUrl, walletLogin, type WalletSession } from './wallet-api-client';

function operatorVaultPath(): string {
  return (process.env.VAULT_OPERATOR_WALLET_PATH || 'operator/wallet').replace(/^\//, '');
}

function operatorWalletEmail(): string {
  return process.env.OPERATOR_WALLET_EMAIL || 'operator@wallet.internal';
}

function operatorWalletPasswordFromEnv(): string | undefined {
  const p = process.env.OPERATOR_WALLET_PASSWORD;
  return p && p.trim() !== '' ? p : undefined;
}

async function operatorWalletPassword(): Promise<string | undefined> {
  const vault = await vaultKvReadJson(operatorVaultPath());
  if (vault?.accountPassword && typeof vault.accountPassword === 'string') {
    return vault.accountPassword;
  }
  return operatorWalletPasswordFromEnv();
}

function failOnBootstrapError(): boolean {
  return String(process.env.OPERATOR_WALLET_FAIL_ON_ERROR || '').toLowerCase() === 'true';
}

/** Load operator Ed25519/RSA public JWKs from walt.id and persist (for platform DID + Membership issuance). */
export async function refreshOperatorWalletPublicJwksInDb(): Promise<boolean> {
  const row = await prisma.operatorWallet.findFirst();
  if (!row) return false;
  const ed = row.ed25519PublicJwk as Record<string, unknown> | null | undefined;
  const rsa = row.rsaPublicJwk as Record<string, unknown> | null | undefined;
  if (ed?.kty && rsa?.kty) return true;

  const password = await operatorWalletPassword();
  if (!password) {
    logger.warn({ component: 'operator-wallet' }, 'Cannot refresh operator JWKs — no operator password in Vault or env');
    return false;
  }
  const email = operatorWalletEmail();
  const baseURL = getWalletApiBaseUrl();
  try {
    const session = await walletLogin({ email, password, baseURL });
    const ed25519PublicJwk = await exportWalletPublicJwk(session, row.walletId, row.ed25519KeyId, baseURL);
    const rsaPublicJwk = await exportWalletPublicJwk(session, row.walletId, row.rsaKeyId, baseURL);
    if (!ed25519PublicJwk || !rsaPublicJwk || ed25519PublicJwk.kty !== 'OKP' || rsaPublicJwk.kty !== 'RSA') {
      logger.warn({ component: 'operator-wallet' }, 'walt.id did not return operator public JWKs');
      return false;
    }
    await prisma.operatorWallet.update({
      where: { id: row.id },
      data: {
        ed25519PublicJwk: ed25519PublicJwk as object,
        rsaPublicJwk: rsaPublicJwk as object,
      },
    });
    return true;
  } catch (e) {
    logger.warn({ component: 'operator-wallet', err: (e as Error).message }, 'refreshOperatorWalletPublicJwksInDb failed');
    return false;
  }
}

/**
 * Platform operator walt.id wallet — trust anchor (Membership, Gaia-X subset per ADR-002).
 * @see docs/plans/001-ssi-implementation-plan.md Phase 8
 */
export class OperatorWalletService {
  /**
   * Idempotent startup hook:
   * - If an OperatorWallet row exists → skip.
   * - Else if no password in Vault or OPERATOR_WALLET_PASSWORD → warn.
   * - Else provision via walt.id Wallet API and persist identifiers (no private keys in DB).
   */
  async bootstrapOnStartup(): Promise<void> {
    const existing = await prisma.operatorWallet.findFirst();
    if (existing) {
      logger.info(
        { component: 'operator-wallet', operator_wallet_bootstrap: 'skipped', walletId: existing.walletId },
        'Operator wallet already recorded — skipping bootstrap',
      );
      await refreshOperatorWalletPublicJwksInDb();
      return;
    }

    const password = await operatorWalletPassword();
    if (!password) {
      logger.warn(
        {
          component: 'operator-wallet',
          operator_wallet_bootstrap: 'skipped',
          reason: 'missing_operator_wallet_password',
        },
        'No OperatorWallet row and no operator password in Vault or OPERATOR_WALLET_PASSWORD — bootstrap skipped',
      );
      return;
    }

    const email = operatorWalletEmail();
    try {
      const result = await provisionOperatorWallet({
        email,
        password,
        displayName: process.env.OPERATOR_WALLET_DISPLAY_NAME || undefined,
      });

      await prisma.operatorWallet.create({
        data: {
          walletAccountId: result.walletAccountId,
          walletId: result.walletId,
          ed25519KeyId: result.ed25519KeyId,
          rsaKeyId: result.rsaKeyId,
          ed25519PublicJwk: result.ed25519PublicJwk as object,
          rsaPublicJwk: result.rsaPublicJwk as object,
        },
      });

      await vaultKvWriteJson(operatorVaultPath(), {
        accountEmail: email,
        accountPassword: password,
        walletId: result.walletId,
        walletAccountId: result.walletAccountId,
        ed25519KeyId: result.ed25519KeyId,
        rsaKeyId: result.rsaKeyId,
      });

      logger.info(
        {
          component: 'operator-wallet',
          operator_wallet_bootstrap: 'provisioned',
          walletId: result.walletId,
          walletAccountId: result.walletAccountId,
        },
        'Operator walt.id wallet provisioned and recorded',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          component: 'operator-wallet',
          operator_wallet_bootstrap: 'failed',
          err: message,
        },
        'Operator wallet bootstrap failed',
      );
      if (failOnBootstrapError()) {
        process.exit(1);
      }
    }
  }
}

export async function bootstrapOperatorWallet(): Promise<void> {
  await new OperatorWalletService().bootstrapOnStartup();
}

export type OperatorWalletContext = {
  session: WalletSession;
  walletId: string;
  ed25519KeyId: string;
  rsaKeyId: string;
};

/**
 * Log in with the operator wallet credentials and return session + key IDs.
 * Used by issuers that need to sign credentials with the operator's private key.
 */
export async function getOperatorWalletContext(): Promise<OperatorWalletContext | null> {
  const row = await prisma.operatorWallet.findFirst();
  if (!row) return null;

  const password = await operatorWalletPassword();
  if (!password) {
    logger.warn({ component: 'operator-wallet' }, 'No operator wallet password in Vault or env — cannot get context');
    return null;
  }

  try {
    const session = await walletLogin({ email: operatorWalletEmail(), password, baseURL: getWalletApiBaseUrl() });
    return { session, walletId: row.walletId, ed25519KeyId: row.ed25519KeyId, rsaKeyId: row.rsaKeyId };
  } catch (e) {
    logger.warn({ component: 'operator-wallet', err: (e as Error).message }, 'Operator wallet login failed');
    return null;
  }
}

/**
 * Export the operator's Ed25519 private JWK — needed to pass as issuerKey to the waltid issuer API.
 * The private key is held in memory transiently and never persisted.
 */
export async function getOperatorEd25519PrivateJwk(): Promise<Record<string, unknown> | null> {
  const ctx = await getOperatorWalletContext();
  if (!ctx) return null;
  return exportWalletPrivateJwk(ctx.session, ctx.walletId, ctx.ed25519KeyId);
}
