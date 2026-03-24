-- AlterTable: add email column to company_users
ALTER TABLE "company_users" ADD COLUMN IF NOT EXISTS "email" TEXT;
