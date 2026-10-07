import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum TenantStatus { ACTIVE = "ACTIVE", SUSPENDED = "SUSPENDED" }

export class AdminTenantQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus) status!: TenantStatus;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
