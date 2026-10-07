import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { RequireRole } from "../auth/roles.decorator";
import { CreateVoucherDto, VoucherValidationDto } from "./vouchers.dto";
import { VouchersService } from "./vouchers.service";

@Controller("vouchers")
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}
  @Get() @RequireRole("owner") list() { return this.vouchers.list(); }
  @Post() @RequireRole("owner") create(@Body() body: CreateVoucherDto) { return this.vouchers.create(body); }
  @Delete(":id") @RequireRole("owner") deactivate(@Param("id") id: string) { return this.vouchers.deactivate(id); }
  @Post("validate") @RequireRole("owner", "cashier") validate(@Body() body: VoucherValidationDto) {
    return this.vouchers.preview(body.code, body.subtotal);
  }
}
