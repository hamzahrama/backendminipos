ALTER TABLE "transactions" ADD COLUMN "receipt_token" TEXT;

UPDATE "transactions"
SET "receipt_token" = replace(gen_random_uuid()::text, '-', '')
WHERE "receipt_token" IS NULL;

ALTER TABLE "transactions" ALTER COLUMN "receipt_token" SET NOT NULL;
CREATE UNIQUE INDEX "transactions_receipt_token_key" ON "transactions"("receipt_token");
