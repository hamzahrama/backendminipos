import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const refreshToken = request.body?.refreshToken;
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new UnauthorizedException("Refresh token diperlukan.");
    }

    const claims = await this.authService.verifyRefreshToken(refreshToken);
    if (request.headers["x-tenant-id"] !== claims.tenantId) {
      throw new ForbiddenException("Header x-tenant-id harus sesuai dengan tenant pada refresh token.");
    }

    request.refreshTokenClaims = claims;
    return true;
  }
}
