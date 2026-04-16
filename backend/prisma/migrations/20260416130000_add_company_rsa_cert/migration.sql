-- AlterTable: add self-signed X.509 certificate PEM for company RSA key
-- Used by Gaia-X compliance (x5c in DID document verification method)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "rsaCertPem" TEXT;
