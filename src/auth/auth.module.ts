import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import pkg from "@nestjs/jwt";
const { JwtModule } = pkg;
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { RefreshTokenGuard } from "./refresh-token.guard";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [AuthService],
})
export class AuthModule {}
