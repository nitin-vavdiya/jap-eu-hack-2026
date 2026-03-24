-- AddForeignKey
ALTER TABLE "org_credentials" ADD CONSTRAINT "org_credentials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
