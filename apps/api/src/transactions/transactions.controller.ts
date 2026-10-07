import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { CreateTransactionDto } from "../customers/customers.dto";
import { TransactionsService } from "./transactions.service";

@Controller("transactions")
@RequireRole("owner", "cashier")
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}
  @Post() checkout(
    @Body() body: CreateTransactionDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() request: AuthenticatedRequest,
  ) { return this.transactions.checkout(body, idempotencyKey, request.user.sub); }
}
