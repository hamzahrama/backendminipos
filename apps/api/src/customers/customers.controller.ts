import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RequireRole } from "../auth/roles.decorator";
import { CreateCustomerDto, CustomerSearchDto, UpdateCustomerDto } from "./customers.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
@RequireRole("owner", "cashier")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Query() query: CustomerSearchDto) { return this.customers.list(query.search); }
  @Get("network") @RequireRole("owner") network(@Query("month") month = new Date().toISOString().slice(0, 7)) { return this.customers.network(month); }
  @Post() create(@Body() body: CreateCustomerDto) { return this.customers.create(body); }
  @Get(":id") profile(@Param("id") id: string) { return this.customers.profile(id); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: UpdateCustomerDto) { return this.customers.update(id, body); }
  @Delete(":id") remove(@Param("id") id: string) { return this.customers.remove(id); }
}
