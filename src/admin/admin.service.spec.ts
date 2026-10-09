import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AdminService } from "./admin.service";
import { TenantStatus } from "./admin.dto";
import { describe, expect, it, vi } from "vitest";

function makeService(prisma: Record<string, unknown>) {
  const context = new TenantContextService();
  const auth = { invalidateTenantStatus: vi.fn() };
  const service = new AdminService(prisma as unknown as PrismaService, context, auth as unknown as AuthService);
  return { service, context, auth };
}

const tenantRow = (id: string) => ({
  id, name: "Toko Sehat", slug: "toko-sehat", status: "ACTIVE", suspendedAt: null, suspendReason: null,
  createdAt: new Date("2026-10-01"), publicCatalogEnabled: false,
  _count: { memberships: 2, products: 3, customers: 4, transactions: 5, productImages: 1, stockMovements: 6, auditLogs: 7 },
});

describe("AdminService.summary", () => {
  it("aggregates platform-wide stats", async () => {
    const { service } = makeService({
      tenant: { count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2) },
      user: { count: vi.fn().mockResolvedValue(9) },
      saleTransaction: {
        count: vi.fn().mockResolvedValue(42),
        aggregate: vi.fn().mockResolvedValue({ _sum: { total: 1234.5 } }),
      },
    });
    await expect(service.summary()).resolves.toEqual({
      tenants: 5, activeTenants: 3, suspendedTenants: 2, users: 9, transactions30d: 42, revenue30d: 1234.5,
    });
  });

  it("counts transactions only within the last 30 days", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const aggregate = vi.fn().mockResolvedValue({ _sum: { total: null } });
    const { service } = makeService({
      tenant: { count: vi.fn().mockResolvedValue(1) },
      user: { count: vi.fn().mockResolvedValue(1) },
      saleTransaction: { count, aggregate },
    });
    await service.summary();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(count).toHaveBeenCalledWith({ where: { createdAt: { gte: expect.any(Date) } } });
    expect(count.mock.calls[0][0].where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(thirtyDaysAgo.getTime() - 1000);
    expect(aggregate).toHaveBeenCalledWith({ where: { createdAt: { gte: expect.any(Date) } }, _sum: { total: true } });
  });
});

describe("AdminService tenant scope isolation", () => {
  it("runs platform queries outside the caller's tenant scope", async () => {
    const context = new TenantContextService();
    let scopeDuringQuery: unknown = "sentinel";
    const prisma = {
      tenant: {
        count: vi.fn().mockImplementation(() => {
          scopeDuringQuery = context.getTenantId();
          return Promise.resolve(0);
        }),
      },
      user: { count: vi.fn().mockResolvedValue(0) },
      saleTransaction: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }),
      },
    } as unknown as PrismaService;
    const service = new AdminService(prisma, context, { invalidateTenantStatus: vi.fn() } as unknown as AuthService);
    await context.run("tenant-1", () => service.summary());
    expect(scopeDuringQuery).toBeUndefined();
  });
});

describe("AdminService.listTenants", () => {
  it("filters by status and search, and computes usage metrics", async () => {
    const findMany = vi.fn().mockResolvedValue([tenantRow("t-1")]);
    const groupBy = vi.fn()
      .mockResolvedValueOnce([{ tenantId: "t-1", _count: { _all: 8 }, _sum: { total: 9000 }, _max: { createdAt: new Date("2026-10-01") } }])
      .mockResolvedValueOnce([{ tenantId: "t-1", _max: { createdAt: new Date("2026-10-02") } }]);
    const { service } = makeService({ tenant: { findMany }, saleTransaction: { groupBy } });
    const result = await service.listTenants({ search: "  Sehat ", status: TenantStatus.ACTIVE });
    expect(findMany.mock.calls[0][0]).toEqual({
      where: {
        status: "ACTIVE",
        OR: [{ name: { contains: "Sehat", mode: "insensitive" } }, { slug: { contains: "Sehat", mode: "insensitive" } }],
      },
      orderBy: { createdAt: "desc" }, take: 200,
      select: {
        id: true, name: true, slug: true, status: true, suspendedAt: true, suspendReason: true, createdAt: true, publicCatalogEnabled: true,
        _count: { select: { memberships: true, products: true, customers: true, transactions: true, productImages: true, stockMovements: true, auditLogs: true } },
      },
    });
    expect(result).toEqual([{
      id: "t-1", name: "Toko Sehat", slug: "toko-sehat", status: "ACTIVE", suspendedAt: null, suspendReason: null,
      createdAt: new Date("2026-10-01"), publicCatalogEnabled: false,
      usage: {
        users: 2, products: 3, customers: 4, transactions: 5, images: 1,
        transactions30d: 8, revenue30d: 9000, lastTransactionAt: new Date("2026-10-02"),
        estimatedDbBytes: (3 + 4 + 5 + 6 + 7) * 512,
      },
    }]);
  });

  it("skips usage queries when no tenants match", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const groupBy = vi.fn();
    const { service } = makeService({ tenant: { findMany }, saleTransaction: { groupBy } });
    await expect(service.listTenants({})).resolves.toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("AdminService.getTenant", () => {
  it("returns tenant detail with memberships and recent audit entries", async () => {
    const membership = { createdAt: new Date("2026-10-01"), role: { code: "owner" }, user: { id: "u-1", name: "Pemilik", email: "pemilik@example.com" } };
    const { service } = makeService({
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t-1", name: "Toko Sehat", slug: "toko-sehat", status: "SUSPENDED", suspendedAt: new Date(), suspendReason: "banned", createdAt: new Date(), memberships: [membership],
        }),
      },
      auditLog: { findMany: vi.fn().mockResolvedValue([{ action: "SALE_CREATE", resource: "transaction:1", createdAt: new Date() }]) },
    });
    const result = await service.getTenant("t-1");
    expect(result.memberships).toEqual([membership]);
    expect(result.recentAudit).toEqual([{ action: "SALE_CREATE", resource: "transaction:1", createdAt: expect.any(Date) }]);
  });

  it("throws when the tenant does not exist", async () => {
    const { service } = makeService({ tenant: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(service.getTenant("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AdminService.setStatus", () => {
  it("rejects suspending the super admin's own store", async () => {
    const { service } = makeService({ tenant: { findUnique: vi.fn() }, $transaction: vi.fn() });
    await expect(async () =>
      service.setStatus("t-1", { status: TenantStatus.SUSPENDED, reason: "x" }, { sub: "u-1", tenantId: "t-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects suspension without a reason", async () => {
    const { service } = makeService({ tenant: { findUnique: vi.fn() }, $transaction: vi.fn() });
    await expect(async () =>
      service.setStatus("t-2", { status: TenantStatus.SUSPENDED }, { sub: "u-1", tenantId: "t-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("suspends: updates tenant, revokes sessions, audits, and invalidates the status cache", async () => {
    const tx = {
      tenant: { update: vi.fn().mockResolvedValue({ id: "t-2", name: "Toko", slug: "toko", status: "SUSPENDED", suspendedAt: new Date("2026-10-08"), suspendReason: "pelanggaran" }) },
      refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, auth } = makeService({
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t-2" }) },
      $transaction: vi.fn((callback: (client: unknown) => unknown) => callback(tx)),
    });
    await service.setStatus("t-2", { status: TenantStatus.SUSPENDED, reason: " pelanggaran " }, { sub: "u-1", tenantId: "t-1" });
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: "t-2" },
      data: { status: "SUSPENDED", suspendedAt: expect.any(Date), suspendReason: "pelanggaran" },
      select: expect.anything(),
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t-2", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { tenantId: "t-2", userId: "u-1", action: "PLATFORM_SUSPEND", resource: "tenant:t-2" } });
    expect(auth.invalidateTenantStatus).toHaveBeenCalledWith("t-2");
  });

  it("activates: clears suspension fields and does not revoke sessions", async () => {
    const tx = {
      tenant: { update: vi.fn().mockResolvedValue({ id: "t-2", name: "Toko", slug: "toko", status: "ACTIVE", suspendedAt: null, suspendReason: null }) },
      refreshToken: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, auth } = makeService({
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t-2" }) },
      $transaction: vi.fn((callback: (client: unknown) => unknown) => callback(tx)),
    });
    await service.setStatus("t-2", { status: TenantStatus.ACTIVE }, { sub: "u-1", tenantId: "t-1" });
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: "t-2" },
      data: { status: "ACTIVE", suspendedAt: null, suspendReason: null },
      select: expect.anything(),
    });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { tenantId: "t-2", userId: "u-1", action: "PLATFORM_ACTIVATE", resource: "tenant:t-2" } });
    expect(auth.invalidateTenantStatus).toHaveBeenCalledWith("t-2");
  });

  it("throws when the tenant does not exist", async () => {
    const { service } = makeService({ tenant: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn() });
    await expect(service.setStatus("nope", { status: TenantStatus.ACTIVE }, { sub: "u-1", tenantId: "t-1" }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
