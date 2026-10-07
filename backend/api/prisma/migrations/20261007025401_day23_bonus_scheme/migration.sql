-- CreateTable
CREATE TABLE "bonus_schemes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bonus_schemes_tenant_id_key" ON "bonus_schemes"("tenant_id");

-- AddForeignKey
ALTER TABLE "bonus_schemes" ADD CONSTRAINT "bonus_schemes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
