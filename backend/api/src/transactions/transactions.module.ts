import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { TransactionsController } from "./transactions.controller";
import { TransactionsService } from "./transactions.service";
import { ReceiptsController } from "./receipts.controller";
import { VouchersModule } from "../vouchers/vouchers.module";

@Module({ imports: [InventoryModule, VouchersModule], controllers: [TransactionsController, ReceiptsController], providers: [TransactionsService] })
export class TransactionsModule {}
