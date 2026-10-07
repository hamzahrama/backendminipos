import { NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PublicCatalogService } from "./public-catalog.service";

const tenant = { id: "tenant-1", name: "Toko Madu", slug: "toko-madu", publicCatalogEnabled: true, whatsAppNumber: "62812", status: "ACTIVE" };

function makePrisma(overrides: { tenant?: unknown; products?: unknown[]; categories?: unknown[] } = {}) {
  return {
    tenant: {
      findMany: vi.fn().mockResolvedValue([{ slug: "toko-madu" }]),
      findUnique: vi.fn().mockResolvedValue("tenant" in overrides ? overrides.tenant : tenant),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ publicCatalogEnabled: true }),
      update: vi.fn().mockResolvedValue({ publicCatalogEnabled: false }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue(overrides.products ?? [
        { id: "p1", name: "Madu", sku: "M1", batches: [{ quantity: 2 }, { quantity: "3" }] },
        { id: "p2", name: "Teh", sku: "T1", batches: [{ quantity: 1 }] },
      ]),
    },
    category: { findMany: vi.fn().mockResolvedValue(overrides.categories ?? [{ name: "Herbal" }, { name: "Madu" }]) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new PublicCatalogService(prisma as unknown as PrismaService);
}

describe("PublicCatalogService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-07 20:00 UTC is already 2026-10-08 in Asia/Jakarta (UTC+7).
    vi.setSystemTime(new Date("2026-10-07T20:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("lists enabled catalog slugs", async () => {
    const prisma = makePrisma();
    await expect(makeService(prisma).listEnabledSlugs()).resolves.toEqual([{ slug: "toko-madu" }]);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { publicCatalogEnabled: true, status: "ACTIVE" }, select: { slug: true, updatedAt: true }, orderBy: { name: "asc" },
    });
  });

  it("returns store, categories and products with available quantity", async () => {
    const prisma = makePrisma();
    const result = await makeService(prisma).getCatalog("toko-madu", {});
    expect(result).toEqual({
      store: { name: "Toko Madu", slug: "toko-madu", whatsAppNumber: "62812" },
      categories: ["Herbal", "Madu"],
      products: [
        { id: "p1", name: "Madu", sku: "M1", availableQuantity: 5 },
        { id: "p2", name: "Teh", sku: "T1", availableQuantity: 1 },
      ],
    });
    const args = prisma.product.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: "tenant-1", deletedAt: null, isActive: true });
    expect(args.where.OR).toBeUndefined();
    expect(args.where.category).toBeUndefined();
    const today = new Date("2026-10-08T00:00:00.000Z");
    expect(args.where.batches.some).toEqual({ tenantId: "tenant-1", quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] });
    expect(args.select.batches.where.tenantId).toBe("tenant-1");
    expect(prisma.category.findMany.mock.calls[0][0].where.tenantId).toBe("tenant-1");
  });

  it("applies search and category filters", async () => {
    const prisma = makePrisma();
    await makeService(prisma).getCatalog("toko-madu", { search: "madu", category: "Herbal" });
    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where.category).toEqual({ name: "Herbal" });
    expect(where.OR).toEqual([
      { name: { contains: "madu", mode: "insensitive" } },
      { sku: { contains: "madu", mode: "insensitive" } },
    ]);
  });

  it("hides missing, disabled, or suspended catalogs", async () => {
    await expect(makeService(makePrisma({ tenant: null })).getCatalog("x", {})).rejects.toBeInstanceOf(NotFoundException);
    const disabled = makePrisma({ tenant: { ...tenant, publicCatalogEnabled: false } });
    await expect(makeService(disabled).getCatalog("toko-madu", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(disabled.product.findMany).not.toHaveBeenCalled();
    const suspended = makePrisma({ tenant: { ...tenant, status: "SUSPENDED" } });
    await expect(makeService(suspended).getCatalog("toko-madu", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(suspended.product.findMany).not.toHaveBeenCalled();
  });

  it("returns a single product or NotFound", async () => {
    const service = makeService(makePrisma());
    await expect(service.getProduct("toko-madu", "p2")).resolves.toEqual({
      store: { name: "Toko Madu", slug: "toko-madu", whatsAppNumber: "62812" },
      product: { id: "p2", name: "Teh", sku: "T1", availableQuantity: 1 },
    });
    await expect(service.getProduct("toko-madu", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reads settings for a tenant", async () => {
    const prisma = makePrisma();
    await makeService(prisma).getSettings("tenant-1");
    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: { publicCatalogEnabled: true, whatsAppNumber: true, dailyReportEnabled: true, dailyReportHour: true },
    });
  });

  it("updates only provided settings and normalizes WhatsApp number", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await service.updateSettings("tenant-1", { publicCatalogEnabled: true, whatsAppNumber: " 62812 ", dailyReportEnabled: false, dailyReportHour: 21 });
    expect(prisma.tenant.update.mock.calls[0][0]).toMatchObject({
      where: { id: "tenant-1" },
      data: { publicCatalogEnabled: true, whatsAppNumber: "62812", dailyReportEnabled: false, dailyReportHour: 21 },
    });
    await service.updateSettings("tenant-1", { whatsAppNumber: "   " });
    expect(prisma.tenant.update.mock.calls[1][0].data).toEqual({ whatsAppNumber: null });
    await service.updateSettings("tenant-1", { whatsAppNumber: null });
    expect(prisma.tenant.update.mock.calls[2][0].data).toEqual({ whatsAppNumber: null });
    await service.updateSettings("tenant-1", {});
    expect(prisma.tenant.update.mock.calls[3][0].data).toEqual({});
  });
});
