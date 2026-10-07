-- CreateTable
CREATE TABLE "whatsapp_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "phone" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_logs_tenant_id_created_at_idx" ON "whatsapp_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_logs_transaction_id_idx" ON "whatsapp_logs"("transaction_id");

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
