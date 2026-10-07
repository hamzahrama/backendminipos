import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { DailyReportEmailService } from "./daily-email.service";

@Module({ controllers: [ReportsController], providers: [ReportsService, DailyReportEmailService] })
export class ReportsModule {}
