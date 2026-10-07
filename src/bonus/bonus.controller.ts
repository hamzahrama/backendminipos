import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { BonusSchemeDto, MonthQueryDto, SimulateBonusDto } from "./bonus.dto";
import { BonusService } from "./bonus.service";

@Controller("bonus")
@RequireRole("owner")
export class BonusController {
  constructor(private readonly bonus: BonusService) {}
  @Get("scheme") scheme() { return this.bonus.getScheme(); }
  @Put("scheme") saveScheme(@Body() body: BonusSchemeDto, @Req() request: AuthenticatedRequest) { return this.bonus.saveScheme(body, request.user.sub); }
  @Get("leaderboard") @RequireRole("owner", "cashier", "agent") leaderboard(@Query() query: MonthQueryDto) { return this.bonus.leaderboard(query.month); }
  @Get("members/:customerId") member(@Param("customerId") customerId: string, @Query() query: MonthQueryDto) { return this.bonus.memberBonus(query.month, customerId); }
  @Post("simulate") simulate(@Body() body: SimulateBonusDto) { return this.bonus.simulate(body); }
}
