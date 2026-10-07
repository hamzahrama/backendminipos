-- CreateTable
CREATE TABLE "operating_expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operating_expenses_tenant_id_date_idx" ON "operating_expenses"("tenant_id", "date");

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
