import { IsArray, ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Transform, Type } from "class-transformer";

export class CreateCustomerDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{4,32}$/i) hniId?: string;
  @IsOptional() @IsString() @MaxLength(32) uplineHniId?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsDateString() birthDate?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{4,32}$/i) hniId?: string | null;
  @IsOptional() @IsString() @MaxLength(32) uplineHniId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
}

export class CustomerSearchDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class CreateTransactionItemDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discountAmount?: number;
}

export class CreateTransactionDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{4,32}$/i) memberHniId?: string;
  @IsBoolean() memberMode!: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreateTransactionItemDto)
  items!: CreateTransactionItemDto[];
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cashReceived!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discountAmount?: number;
  @IsOptional() @IsString() @MaxLength(32) voucherCode?: string;
}
