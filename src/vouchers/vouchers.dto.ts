import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export class CreateVoucherDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  @IsString() @Matches(/^[A-Z0-9_-]{3,32}$/) code!: string;
  @IsIn(["PERCENT", "FIXED"]) discountType!: "PERCENT" | "FIXED";
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) value!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxDiscount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) maxUses?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class VoucherValidationDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  @IsString() @MaxLength(32) code!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) subtotal!: number;
}
