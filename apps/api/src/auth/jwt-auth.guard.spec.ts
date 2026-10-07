import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

const tokenClaims = {
  sub: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  tenantSlug: "toko-sehat",
  roles: ["owner"],
  permissions: ["dashboard:read"],
  tokenType: "access" as const,
};

function makeContext(headers: Record<string, string>) {
  const request = { headers };
  const context = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { context, request };
}

describe("JwtAuthGuard tenant header", () => {
  it("accepts the tenant ID only when it matches the signed access token", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const authService = { verifyAccessToken: vi.fn().mockResolvedValue(tokenClaims), assertTenantActive: vi.fn().mockResolvedValue(undefined) };
    const guard = new JwtAuthGuard(authService as unknown as AuthService, reflector);
    const { context, request } = makeContext({
      authorization: "Bearer valid.access.token",
      "x-tenant-id": "tenant-1",
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request).toHaveProperty("user", tokenClaims);
  });

  it("rejects a tenant header that differs from the signed access token", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const authService = { verifyAccessToken: vi.fn().mockResolvedValue(tokenClaims), assertTenantActive: vi.fn().mockResolvedValue(undefined) };
    const guard = new JwtAuthGuard(authService as unknown as AuthService, reflector);
    const { context } = makeContext({
      authorization: "Bearer valid.access.token",
      "x-tenant-id": "tenant-other",
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
