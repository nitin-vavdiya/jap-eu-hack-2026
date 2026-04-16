-- CreateTable
CREATE TABLE "operator_wallet" (
    "id" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "ed25519KeyId" TEXT NOT NULL,
    "rsaKeyId" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_wallet_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "walletAccountId" TEXT,
ADD COLUMN "walletId" TEXT,
ADD COLUMN "ed25519KeyId" TEXT,
ADD COLUMN "rsaKeyId" TEXT,
ADD COLUMN "ed25519PublicJwk" JSONB,
ADD COLUMN "rsaPublicJwk" JSONB,
ADD COLUMN "walletProvisioned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "org_credentials" ADD COLUMN "walletCredentialId" TEXT;
