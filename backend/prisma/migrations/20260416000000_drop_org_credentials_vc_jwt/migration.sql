-- Greenfield: VC-JWT material is not stored in Postgres (wallet is source of truth; index walletCredentialId only).
ALTER TABLE "org_credentials" DROP COLUMN IF EXISTS "vcJwt";
