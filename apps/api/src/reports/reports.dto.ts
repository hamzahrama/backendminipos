import { IsDateString, IsString, Matches } from "class-validator";

export class ReportRangeDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class PvReportQueryDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}
