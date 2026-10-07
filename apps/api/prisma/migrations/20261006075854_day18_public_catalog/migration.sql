-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "public_catalog_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_number" TEXT;
