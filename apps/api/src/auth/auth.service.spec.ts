import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService, isSuperAdminEmail } from "./auth.service";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

function makeMembership() {
  return {
    user: {
      id: "user-1",
      name: "Agen HNI",
      email: "agen@example.com",
      passwordHash: "password-hash",
    },
    tenant: { id: "tenant-1", name: "Toko Sehat", slug: "toko-sehat" },
    role: {
      code: "owner",
      permissions: [{ permission: { code: "sales:create" } }],
    },
  };
}

function makeTokenPairJwt() {
  return { signAsync: vi.fn().mockResolvedValueOnce("access.jwt.token").mockResolvedValueOnce("refresh.jwt.token") };
}

describe("AuthService", () => {
  it("registers a tenant, creates its owner role, and returns JWTs", async () => {
    const tx = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "tenant-1", ...data }),
        ),
      },
      permission: {
        upsert: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve({ id: `permission-${where.code}`, code: where.code }),
        ),
      },
      role: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: `role-${data.code}`, ...data }),
        ),
      },
      rolePermission: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: {
        create: vi.fn().mockResolvedValue({
          id: "user-1",
          name: "Pemilik Toko",
          email: "owner@example.com",
        }),
      },
      userTenant: { create: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, makeTokenPairJwt() as never);

    const result = await auth.registerTenant({
      tenantName: "Toko Sehat",
      ownerName: "Pemilik Toko",
      email: " OWNER@example.com ",
      password: "password-yang-aman",
    });

    expect(tx.tenant.create).toHaveBeenCalledWith({
      data: { name: "Toko Sehat", slug: "toko-sehat" },
    });
    expect(tx.role.create).toHaveBeenCalledTimes(3);
    expect(tx.userTenant.create).toHaveBeenCalledWith({
      data: { userId: "user-1", tenantId: "tenant-1", roleId: "role-owner" },
    });
    expect(tx.permission.upsert).toHaveBeenCalledTimes(6);
    expect(result.accessToken).toBe("access.jwt.token");
    expect(result.user.roles).toEqual(["owner"]);
  });

  it("logs in with the selected tenant and returns that membership's permissions", async () => {
    const membership = makeMembership();
    membership.user.passwordHash = await hash("password-ku", 4);
    const prisma = {
      userTenant: { findFirst: vi.fn().mockResolvedValue(membership) },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, makeTokenPairJwt() as never);

    const result = await auth.login({
      email: "AGEN@example.com",
      password: "password-ku",
      tenantSlug: "Toko-Sehat",
    });

    expect(prisma.userTenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { email: "agen@example.com" }, tenant: { slug: "toko-sehat" } } }),
    );
    expect(result.user.tenant.id).toBe("tenant-1");
    expect(result.user.permissions).toEqual(["sales:create"]);
    expect(result.refreshToken).toBe("refresh.jwt.token");
  });

  it("loads the current profile from the user-tenant membership", async () => {
    const prisma = {
      userTenant: { findUnique: vi.fn().mockResolvedValue(makeMembership()) },
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, {} as never);

    const result = await auth.getProfile({
      sub: "user-1",
      email: "agen@example.com",
      tenantId: "tenant-1",
      tenantSlug: "toko-sehat",
      roles: ["owner"],
      permissions: ["dashboard:read"],
      tokenType: "access",
    });

    expect(prisma.userTenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_tenantId: { userId: "user-1", tenantId: "tenant-1" } },
      }),
    );
    expect(result).toEqual({
      userId: "user-1",
      email: "agen@example.com",
      tenantId: "tenant-1",
      tenantSlug: "toko-sehat",
      roles: ["owner"],
    });
  });

  it("rotates a refresh token and stores only the replacement token hash", async () => {
    const refreshToken = "old.refresh.token";
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const claims = {
      sub: "user-1",
      tenantId: "tenant-1",
      familyId: "family-1",
      tokenType: "refresh" as const,
      jti: "token-1",
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({});
    const membership = makeMembership();
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "refresh-1",
          userId: claims.sub,
          tenantId: claims.tenantId,
          tokenHash,
          familyId: claims.familyId,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
      },
      userTenant: { findUnique: vi.fn().mockResolvedValue(membership) },
      $transaction: vi.fn((callback: (transaction: unknown) => unknown) =>
        callback({ refreshToken: { updateMany, create } }),
      ),
    } as unknown as PrismaService;
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue(claims),
      signAsync: vi.fn().mockResolvedValueOnce("new.access.jwt").mockResolvedValueOnce("new.refresh.jwt"),
    };
    const auth = new AuthService(prisma, jwt as never);

    const result = await auth.refresh(refreshToken);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "refresh-1", tokenHash }) }),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        familyId: "family-1",
        tokenHash: createHash("sha256").update("new.refresh.jwt").digest("hex"),
      }),
    });
    expect(result.accessToken).toBe("new.access.jwt");
    expect(result.refreshToken).toBe("new.refresh.jwt");
  });

  it("rejects and revokes the token family when a rotated token is replayed", async () => {
    const refreshToken = "old.refresh.token";
    const claims = {
      sub: "user-1",
      tenantId: "tenant-1",
      familyId: "family-1",
      tokenType: "refresh" as const,
      jti: "token-1",
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "refresh-1",
          userId: claims.sub,
          tenantId: claims.tenantId,
          tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
          familyId: claims.familyId,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(claims) };
    const auth = new AuthService(prisma, jwt as never);

    await expect(auth.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokes the active refresh-token family on logout", async () => {
    const claims = {
      sub: "user-1",
      tenantId: "tenant-1",
      familyId: "family-1",
      tokenType: "refresh" as const,
      jti: "token-1",
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { refreshToken: { updateMany } } as unknown as PrismaService;
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(claims) };
    const auth = new AuthService(prisma, jwt as never);

    await expect(
      auth.logout("refresh.jwt.token", {
        sub: "user-1",
        email: "owner@example.com",
        tenantId: "tenant-1",
        tenantSlug: "toko-sehat",
        roles: ["owner"],
        permissions: [],
        tokenType: "access",
      }),
    ).resolves.toEqual({ status: "ok" });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        familyId: "family-1",
        userId: "user-1",
        tenantId: "tenant-1",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("AuthService tenant status & super admin", () => {
  const claims = { sub: "user-1", email: "owner@example.com", tenantId: "tenant-1", tenantSlug: "t", roles: ["owner"], permissions: [], tokenType: "access" as const };

  it("blocks login to a suspended tenant", async () => {
    const membership = { ...makeMembership(), tenant: { id: "tenant-1", name: "Toko", slug: "toko", status: "SUSPENDED" } };
    membership.user.passwordHash = await hash("password-ku", 4);
    const prisma = { userTenant: { findFirst: vi.fn().mockResolvedValue(membership) } } as unknown as PrismaService;
    const auth = new AuthService(prisma, makeTokenPairJwt() as never);
    await expect(auth.login({ email: "agen@example.com", password: "password-ku", tenantSlug: "toko" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("adds the super_admin role for configured emails", async () => {
    process.env.SUPER_ADMIN_EMAILS = "admin@example.com, agen@example.com";
    try {
      expect(isSuperAdminEmail("AGEN@example.com")).toBe(true);
      const membership = makeMembership();
      membership.user.passwordHash = await hash("password-ku", 4);
      const prisma = { userTenant: { findFirst: vi.fn().mockResolvedValue(membership) }, refreshToken: { create: vi.fn() } } as unknown as PrismaService;
      const auth = new AuthService(prisma, makeTokenPairJwt() as never);
      const result = await auth.login({ email: "agen@example.com", password: "password-ku", tenantSlug: "toko-sehat" });
      expect(result.user.roles).toEqual(["owner", "super_admin"]);
    } finally { delete process.env.SUPER_ADMIN_EMAILS; }
    expect(isSuperAdminEmail("agen@example.com")).toBe(false);
  });

  it("caches tenant status checks and rejects suspended tenants per request", async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: "ACTIVE" });
    const auth = new AuthService({ tenant: { findUnique } } as unknown as PrismaService, makeTokenPairJwt() as never);
    await auth.assertTenantActive(claims);
    await auth.assertTenantActive(claims);
    expect(findUnique).toHaveBeenCalledTimes(1);
    findUnique.mockResolvedValueOnce({ status: "SUSPENDED" });
    auth.invalidateTenantStatus("tenant-1");
    await expect(auth.assertTenantActive(claims)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.assertTenantActive({ ...claims, roles: ["owner", "super_admin"] })).resolves.toBeUndefined();
    findUnique.mockResolvedValueOnce(null);
    await expect(auth.assertTenantActive({ ...claims, tenantId: "gone" })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
