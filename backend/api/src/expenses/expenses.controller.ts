import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { CreateExpenseDto } from "./expenses.dto";
import { ExpensesService } from "./expenses.service";

@Controller("expenses")
@RequireRole("owner")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}
  @Get() list(@Query("from") from?: string, @Query("to") to?: string) { return this.expenses.list(from, to); }
  @Post() create(@Body() body: CreateExpenseDto, @Req() request: AuthenticatedRequest) { return this.expenses.create(body, request.user.sub); }
  @Delete(":id") remove(@Param("id") id: string) { return this.expenses.remove(id); }
}
