-- CreateTable
CREATE TABLE "network_tree" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "parent_customer_id" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "external_upline_hni_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_tree_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "network_tree_customer_id_key" ON "network_tree"("customer_id");

-- CreateIndex
CREATE INDEX "network_tree_tenant_id_parent_customer_id_idx" ON "network_tree"("tenant_id", "parent_customer_id");

-- AddForeignKey
ALTER TABLE "network_tree" ADD CONSTRAINT "network_tree_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_tree" ADD CONSTRAINT "network_tree_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_tree" ADD CONSTRAINT "network_tree_parent_customer_id_fkey" FOREIGN KEY ("parent_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
