-- Cached operator public JWKs for platform did:web without VPSigner.
ALTER TABLE "operator_wallet" ADD COLUMN IF NOT EXISTS "ed25519PublicJwk" JSONB;
ALTER TABLE "operator_wallet" ADD COLUMN IF NOT EXISTS "rsaPublicJwk" JSONB;

-- Index of Membership VC stored in the company's walt.id wallet (operator-issued).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "membershipWalletCredentialId" TEXT;
