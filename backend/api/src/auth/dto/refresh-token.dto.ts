import { IsJWT } from "class-validator";

export class RefreshTokenDto {
  @IsJWT()
  refreshToken!: string;
}
