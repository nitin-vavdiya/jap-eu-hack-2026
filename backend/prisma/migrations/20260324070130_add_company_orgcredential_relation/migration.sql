-- Remove orphaned org_credentials whose companyId does not exist in companies
-- (can happen on dev/staging where data was inserted before the FK existed)

-- AddForeignKey
ALTER TABLE "org_credentials" ADD CONSTRAINT "org_credentials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
