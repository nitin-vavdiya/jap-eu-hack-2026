-- Migration: wallet-only VC storage
-- Replace the issuedVCs JSON blob (anti-pattern: duplicate credential storage) with a single
-- lpVcJwt TEXT column used only for serving /vc/:id/jwt (GXDCH public URL resolution).
-- All credentials are now stored exclusively in the company's walt.id wallet.

-- Rescue LP VC JWT from existing issuedVCs blobs before dropping the column.
ALTER TABLE org_credentials ADD COLUMN "lpVcJwt" TEXT;

UPDATE org_credentials
SET "lpVcJwt" = (
  SELECT elem->>'jwt'
  FROM jsonb_array_elements("issuedVCs"::jsonb) AS elem
  WHERE elem->>'type' = 'LegalParticipantVC'
    AND elem->>'jwt' IS NOT NULL
  LIMIT 1
)
WHERE "issuedVCs" IS NOT NULL
  AND "issuedVCs"::text != '[]';

ALTER TABLE org_credentials DROP COLUMN "issuedVCs";
