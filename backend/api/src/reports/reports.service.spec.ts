import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { ReportsService } from "./reports.service";

function makeService(prisma: Record<string, unknown>) {
  const context = new TenantContextService();
  const service = new ReportsService(prisma as unknown as PrismaService, context);
  return { service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

describe("ReportsService.summary", () => {
  it("aggregates revenue, basket size, WIB hours and categories", async () => {
    const prisma = {
      saleTransaction: {
        findMany: vi.fn().mockResolvedValue([
          { id: "t1", total: 100000, createdAt: new Date("2026-10-07T02:30:00Z"), items: [
            { quantity: 2, lineTotal: 100000, product: { category: { id: "c1", name: "Madu" } } },
          ] },
          { id: "t2", total: 50000, createdAt: new Date("2026-10-07T02:45:00Z"), items: [
            { quantity: 1, lineTotal: 50000, product: null },
          ] },
        ]),
      },
    };
    const { service, run } = makeService(prisma);
    const result = await run(() => service.summary({ from: "2026-10-07", to: "2026-10-07" }));
    expect(result.totalRevenue).toBe(150000);
    expect(result.transactionCount).toBe(2);
    expect(result.averageBasketSize).toBe(1.5);
    expect(result.hourly[9]).toMatchObject({ transactions: 2, revenue: 150000 });
    expect(result.categories[0]).toMatchObject({ category: "Madu", revenue: 100000 });
    expect(result.categories[1]).toMatchObject({ category: "Lainnya" });
  });

  it("rejects ranges over 93 days and inverted ranges", async () => {
    const { service, run } = makeService({});
    await expect(run(() => service.summary({ from: "2026-01-01", to: "2026-06-01" }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(() => service.summary({ from: "2026-02-01", to: "2026-01-01" }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReportsService.profitLoss", () => {
  it("computes gross and net profit and flags missing cost", async () => {
    const prisma = {
      saleTransaction: { findMany: vi.fn().mockResolvedValue([{ invoiceNo: "INV-1", total: 200000 }]) },
      stockMovement: { findMany: vi.fn().mockResolvedValue([
        { quantity: 2, batch: { unitCost: 50000 } }, { quantity: 1, batch: { unitCost: null } },
      ]) },
      expense: { findMany: vi.fn().mockResolvedValue([{ category: "Listrik", amount: 20000 }, { category: "Listrik", amount: 5000 }]) },
    };
    const { service, run } = makeService(prisma);
    const result = await run(() => service.profitLoss({ from: "2026-10-01", to: "2026-10-31" }));
    expect(result).toMatchObject({ revenue: 200000, costOfGoods: 100000, grossProfit: 100000, operatingExpense: 25000, netProfit: 75000, missingCostMovementCount: 1 });
    expect(result.expenseCategories).toEqual([{ category: "Listrik", amount: 25000 }]);
  });
});

describe("ReportsService.pvSummary", () => {
  it("returns member, product and member×SKU detail rows with explicit tenant filter on sale items", async () => {
    const customer = { id: "cust-1", name: "Bu Ani", hniProfile: { hniId: "HNI001" } };
    const prisma = {
      pvLog: { findMany: vi.fn().mockResolvedValue([
        { pv: 20, customer, product: { sku: "MH", name: "Madu" } },
        { pv: 5, customer, product: { sku: "MHS", name: "Minyak" } },
      ]) },
      saleItem: { findMany: vi.fn().mockResolvedValue([
        { sku: "MH", productName: "Madu", quantity: 2, unitPv: 10, transaction: { memberHniId: "HNI001", customer } },
        { sku: "MHS", productName: "Minyak", quantity: 1, unitPv: 5, transaction: { memberHniId: "HNI001", customer } },
      ]) },
    };
    const { service, run } = makeService(prisma);
    const result = await run(() => service.pvSummary({ month: "2026-10" }));
    expect(result.totalPv).toBe(25);
    expect(result.members).toEqual([{ customerId: "cust-1", name: "Bu Ani", hniId: "HNI001", totalPv: 25 }]);
    expect(result.details).toEqual([
      { customerId: "cust-1", hniId: "HNI001", name: "Bu Ani", sku: "MH", product: "Madu", quantity: 2, totalPv: 20 },
      { customerId: "cust-1", hniId: "HNI001", name: "Bu Ani", sku: "MHS", product: "Minyak", quantity: 1, totalPv: 5 },
    ]);
    expect(prisma.saleItem.findMany.mock.calls[0][0].where.transaction.tenantId).toBe("tenant-1");
  });

  it("rejects invalid months", async () => {
    const { service, run } = makeService({});
    await expect(run(() => service.pvSummary({ month: "2026-13" }))).rejects.toBeInstanceOf(BadRequestException);
  });
});
