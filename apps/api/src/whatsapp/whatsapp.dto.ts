import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SendReceiptDto {
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

export class WhatsAppLogQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
