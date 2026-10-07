ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_product_id_fkey";
ALTER TABLE "transaction_items" ALTER COLUMN "product_id" DROP NOT NULL;
ALTER TABLE "transaction_items"
  ADD CONSTRAINT "transaction_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pv_logs" DROP CONSTRAINT "pv_logs_product_id_fkey";
ALTER TABLE "pv_logs" ALTER COLUMN "product_id" DROP NOT NULL;
ALTER TABLE "pv_logs"
  ADD CONSTRAINT "pv_logs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
