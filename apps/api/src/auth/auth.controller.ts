import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest } from "./auth.types";
import { RequireRole } from "./roles.decorator";
import { Public } from "./public.decorator";
import { RefreshTokenGuard } from "./refresh-token.guard";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterTenantDto } from "./dto/register-tenant.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register-tenant")
  @Public()
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @Post("login")
  @Public()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @Public()
  @UseGuards(RefreshTokenGuard)
  refresh(@Body() dto: RefreshTokenDto, @Req() request: AuthenticatedRequest) {
    return this.authService.refresh(dto.refreshToken, request.refreshTokenClaims);
  }

  @Post("logout")
  logout(@Body() dto: RefreshTokenDto, @Req() request: AuthenticatedRequest) {
    return this.authService.logout(dto.refreshToken, request.user);
  }

  @Get("me")
  @RequireRole("owner", "cashier", "agent")
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfile(request.user);
  }
}
