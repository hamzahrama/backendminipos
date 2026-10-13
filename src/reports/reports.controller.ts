import { Controller, Get, Header, Query } from "@nestjs/common";
import { RequireRole } from "../auth/roles.decorator";
import { PvReportQueryDto, ReportRangeDto } from "./reports.dto";
import { buildPvCsv, toPvCsvRows } from "./pv-csv";
import { ReportsService } from "./reports.service";

@Controller("reports")
@RequireRole("owner")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("summary") summary(@Query() range: ReportRangeDto) { return this.reports.summary(range); }
  @Get("profit-loss") profitLoss(@Query() range: ReportRangeDto) { return this.reports.profitLoss(range); }
  @Get("pv") pv(@Query() query: PvReportQueryDto) { return this.reports.pvSummary(query); }
  /** Final HPAI-uploadable CSV (Day 17). Query: month=YYYY-MM&mode=per-member|per-member-sku */
  @Get("pv.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async pvCsv(@Query() query: PvReportQueryDto & { mode?: string }) {
    const summary = await this.reports.pvSummary({ month: query.month });
    const mode = query.mode === "per-member" ? "per-member" : "per-member-sku";
    return buildPvCsv(toPvCsvRows(summary.details, mode));
  }
}
