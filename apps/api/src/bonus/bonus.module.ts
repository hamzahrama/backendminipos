import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { BonusController } from "./bonus.controller";
import { BonusService } from "./bonus.service";

@Module({ imports: [CustomersModule], controllers: [BonusController], providers: [BonusService] })
export class BonusModule {}
