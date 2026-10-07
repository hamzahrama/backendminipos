import { Module } from "@nestjs/common";
import { VouchersController } from "./vouchers.controller";
import { VouchersService } from "./vouchers.service";

@Module({ controllers: [VouchersController], providers: [VouchersService], exports: [VouchersService] })
export class VouchersModule {}
