import { Type } from "class-transformer";
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from "class-validator";

export class BonusRankDto {
  @IsString() @Matches(/^[A-Z0-9_]{2,32}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minOwnPv!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minGroupPv!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1) personalRate!: number;
  @IsArray() @ArrayMaxSize(10) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }, { each: true }) @Min(0, { each: true }) @Max(1, { each: true })
  generationRates!: number[];
}

export class BonusBadgeDto {
  @IsString() @MinLength(2) @MaxLength(30) name!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minPv!: number;
}

export class BonusSchemeDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsBoolean() isExample?: boolean;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) pvValue!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BonusRankDto) ranks!: BonusRankDto[];
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => BonusBadgeDto) badges!: BonusBadgeDto[];
}

export class MonthQueryDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
}

export class ScenarioChangeDto {
  @IsString() customerId!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) ownPv?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_]{2,32}$/) targetRankCode?: string;
}

export class SimulateBonusDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
  @IsString() customerId!: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ScenarioChangeDto) changes!: ScenarioChangeDto[];
}
