-- Add companyId to credentials table
ALTER TABLE "credentials" ADD COLUMN "companyId" TEXT;

-- Add foreign key constraint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop credentialId from companies table
ALTER TABLE "companies" DROP COLUMN IF EXISTS "credentialId";
