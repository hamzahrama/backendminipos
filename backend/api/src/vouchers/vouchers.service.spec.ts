import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { VouchersService } from "./vouchers.service";

function makeService(prisma: Record<string, unknown>) {
  const context = new TenantContextService();
  const service = new VouchersService(prisma as unknown as PrismaService, context);
  return { service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

const decimal = (value: number) => new Prisma.Decimal(value);
const voucher = (overrides: Record<string, unknown> = {}) => ({
  id: "v-1", code: "HEMAT", discountType: "PERCENT", value: decimal(10), minSubtotal: decimal(0), maxDiscount: null,
  maxUses: null, usedCount: 0, startsAt: null, endsAt: null, isActive: true, ...overrides,
});

describe("VouchersService.list/create", () => {
  it("lists newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ voucher: { findMany } });
    await service.list();
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  it("creates with defaults and tenant id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "v-1" });
    const { service, run } = makeService({ voucher: { create } });
    await run(() => service.create({ code: "HEMAT", discountType: "FIXED", value: 5000 }));
    expect(create).toHaveBeenCalledWith({ data: {
      tenantId: "tenant-1", code: "HEMAT", discountType: "FIXED", value: 5000, minSubtotal: 0, maxDiscount: undefined,
      maxUses: undefined, startsAt: undefined, endsAt: undefined, isActive: true,
    } });
  });

  it("passes explicit dates and flags", async () => {
    const create = vi.fn().mockResolvedValue({ id: "v-1" });
    const { service, run } = makeService({ voucher: { create } });
    await run(() => service.create({
      code: "X", discountType: "PERCENT", value: 100, minSubtotal: 10000, maxDiscount: 20000, maxUses: 5,
      startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-31T00:00:00Z", isActive: false,
    }));
    expect(create.mock.calls[0][0].data).toMatchObject({
      minSubtotal: 10000, maxDiscount: 20000, maxUses: 5, isActive: false,
      startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-31T00:00:00Z"),
    });
  });

  it("validates percent cap, date order and tenant", async () => {
    const { service, run } = makeService({ voucher: { create: vi.fn() } });
    await expect(run(() => service.create({ code: "X", discountType: "PERCENT", value: 101 }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(() => service.create({ code: "X", discountType: "FIXED", value: 1, startsAt: "2026-10-02", endsAt: "2026-10-02" })))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ code: "X", discountType: "FIXED", value: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps duplicate codes to conflict and rethrows others", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" }))
      .mockRejectedValueOnce(new Error("boom"));
    const { service, run } = makeService({ voucher: { create } });
    await expect(run(() => service.create({ code: "X", discountType: "FIXED", value: 1 }))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.create({ code: "X", discountType: "FIXED", value: 1 }))).rejects.toThrow("boom");
  });
});

describe("VouchersService.deactivate", () => {
  it("deactivates or throws when missing", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const { service } = makeService({ voucher: { updateMany } });
    await expect(service.deactivate("v-1")).resolves.toEqual({ deactivated: true });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "v-1" }, data: { isActive: false } });
    await expect(service.deactivate("v-x")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("VouchersService.findAvailable/preview", () => {
  it("looks up the normalized code scoped to the tenant", async () => {
    const findUnique = vi.fn().mockResolvedValue(voucher());
    const { service, run } = makeService({ voucher: { findUnique } });
    await run(() => service.findAvailable("  hemat "));
    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId_code: { tenantId: "tenant-1", code: "HEMAT" } } });
  });

  it("uses the provided transaction client", async () => {
    const tx = { voucher: { findUnique: vi.fn().mockResolvedValue(voucher()) } };
    const { service, run } = makeService({ voucher: { findUnique: vi.fn() } });
    await run(() => service.findAvailable("HEMAT", tx as unknown as Prisma.TransactionClient));
    expect(tx.voucher.findUnique).toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["inactive", voucher({ isActive: false })],
    ["not started", voucher({ startsAt: new Date(Date.now() + 60_000) })],
    ["expired", voucher({ endsAt: new Date(Date.now() - 60_000) })],
  ])("rejects %s vouchers", async (_label, value) => {
    const { service, run } = makeService({ voucher: { findUnique: vi.fn().mockResolvedValue(value) } });
    await expect(run(() => service.findAvailable("HEMAT"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects exhausted quota but accepts remaining quota within the active window", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce(voucher({ maxUses: 3, usedCount: 3 }))
      .mockResolvedValueOnce(voucher({ maxUses: 3, usedCount: 2, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) }));
    const { service, run } = makeService({ voucher: { findUnique } });
    await expect(run(() => service.findAvailable("HEMAT"))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.findAvailable("HEMAT"))).resolves.toMatchObject({ usedCount: 2 });
  });

  it("requires tenant context", async () => {
    const { service } = makeService({ voucher: { findUnique: vi.fn() } });
    await expect(service.findAvailable("HEMAT")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("previews the discount and enforces minimum subtotal", async () => {
    const findUnique = vi.fn().mockResolvedValue(voucher({ minSubtotal: decimal(50000) }));
    const { service, run } = makeService({ voucher: { findUnique } });
    await expect(run(() => service.preview("hemat", 100000))).resolves.toEqual({ code: "HEMAT", discountAmount: 10000, subtotal: 100000 });
    await expect(run(() => service.preview("hemat", 49999))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("VouchersService.discountFor", () => {
  const { service } = makeService({});

  it("computes percent, fixed, max cap and subtotal cap", () => {
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(10), maxDiscount: null }, 100000)).toBe(10000);
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(50), maxDiscount: decimal(20000) }, 100000)).toBe(20000);
    expect(service.discountFor({ discountType: "FIXED", value: decimal(15000), maxDiscount: null }, 100000)).toBe(15000);
    expect(service.discountFor({ discountType: "FIXED", value: decimal(15000), maxDiscount: null }, 10000)).toBe(10000);
  });

  it("always returns a value rounded to cents, even without a max discount", () => {
    // 33.33% of 100.01 = 33.333333 → must be 33.33, not the unrounded raw value.
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(33.33), maxDiscount: null }, 100.01)).toBe(33.33);
    // 12.5% of 100.03 = 12.50375 → 12.5.
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(12.5), maxDiscount: null }, 100.03)).toBe(12.5);
    // 2.5% of 1.3 = 0.0325 → 0.03
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(2.5), maxDiscount: null }, 1.3)).toBe(0.03);
    // 5% of 0.9 = 0.045 → Math.round gives 0.05 (> raw); must not fall back to raw 0.045.
    expect(service.discountFor({ discountType: "PERCENT", value: decimal(5), maxDiscount: null }, 0.9)).toBe(0.05);
  });
});
