import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
}

export class UpdateCategoryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
}

export class CreateProductDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(64) sku!: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @Type(() => Number) @IsNumber() @Min(0) memberPrice!: number;
  @Type(() => Number) @IsNumber() @Min(0) retailPrice!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pv?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) lowStockLimit?: number;
}

export class UpdateProductDto {
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(64) sku?: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) memberPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) retailPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pv?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) lowStockLimit?: number;
}

export class ListProductsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 10;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean() includeDeleted = false;
}

export class ImportProductRowDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(64) sku!: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @Type(() => Number) @IsNumber() @Min(0) memberPrice!: number;
  @Type(() => Number) @IsNumber() @Min(0) retailPrice!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pv = 0;
}

export class CommitProductImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => ImportProductRowDto)
  rows!: ImportProductRowDto[];
}

export class BulkPriceUpdateDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsString({ each: true })
  productIds!: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) memberPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) retailPrice?: number;
}

export class PresignImageDto {
  @IsString() @MinLength(1) @MaxLength(180) fileName!: string;
  @IsString() @MaxLength(100) contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) size!: number;
}

export class AttachImageDto {
  @IsString() @MinLength(1) @MaxLength(1000) key!: string;
  @IsString() @MinLength(1) @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(160) alt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position = 0;
}
