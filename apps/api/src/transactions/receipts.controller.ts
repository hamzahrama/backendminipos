import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { TransactionsService } from "./transactions.service";

@Controller("receipt")
export class ReceiptsController {
  constructor(private readonly transactions: TransactionsService) {}
  @Get(":token") @Public() getReceipt(@Param("token") token: string) { return this.transactions.publicReceipt(token); }
}
