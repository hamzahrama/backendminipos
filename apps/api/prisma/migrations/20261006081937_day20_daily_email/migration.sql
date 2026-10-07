-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "daily_report_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "daily_report_hour" INTEGER NOT NULL DEFAULT 8;
