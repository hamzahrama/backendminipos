import { Controller, Get, Query } from "@nestjs/common";
import { RequireRole } from "../auth/roles.decorator";
import { PvReportQueryDto, ReportRangeDto } from "./reports.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@RequireRole("owner")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("summary") summary(@Query() range: ReportRangeDto) { return this.reports.summary(range); }
  @Get("profit-loss") profitLoss(@Query() range: ReportRangeDto) { return this.reports.profitLoss(range); }
  @Get("pv") pv(@Query() query: PvReportQueryDto) { return this.reports.pvSummary(query); }
}
