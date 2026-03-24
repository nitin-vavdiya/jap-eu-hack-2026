-- CreateTable
CREATE TABLE "company_users" (
    "id"         TEXT NOT NULL,
    "keycloakId" TEXT NOT NULL,
    "email"      TEXT,
    "companyId"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_users_keycloakId_key" ON "company_users"("keycloakId");

-- AddForeignKey
ALTER TABLE "company_users"
    ADD CONSTRAINT "company_users_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
