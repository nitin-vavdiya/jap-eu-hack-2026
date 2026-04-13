-- DropForeignKey
ALTER TABLE "cars" DROP CONSTRAINT "cars_manufacturerCompanyId_fkey";

-- AlterTable
ALTER TABLE "cars" DROP COLUMN "manufacturerCompanyId",
DROP COLUMN "manufacturerCredentialId",
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "credentialId" TEXT;

-- AlterTable
ALTER TABLE "company_users" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
