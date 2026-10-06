import { Transform, Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateWarehouseDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString() @IsNotEmpty() @MaxLength(24) code!: string;
}

export class StockInDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() warehouseId?: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(80) batchCode!: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @Type(() => Number) @IsNumber() @Min(0.01) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class FefoPreviewDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) quantity!: number;
  @IsOptional() @IsString() warehouseId?: string;
}
