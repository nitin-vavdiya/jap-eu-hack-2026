-- CreateTable
CREATE TABLE "platform_keypairs" (
    "id" TEXT NOT NULL DEFAULT 'platform-signer',
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_keypairs_pkey" PRIMARY KEY ("id")
);
