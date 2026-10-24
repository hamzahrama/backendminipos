import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { MidtransService } from "../integrations/external.service";

@Module({
  imports: [PrismaModule],
  providers: [BillingService, MidtransService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
