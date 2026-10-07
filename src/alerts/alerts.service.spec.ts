import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AlertsService } from "./alerts.service";

const NOW = new Date("2026-10-07T03:00:00.000Z");

function makePrisma(products: unknown[] = [], tenants = [{ id: "tenant-1" }]) {
  return {
    tenant: { findMany: vi.fn().mockResolvedValue(tenants) },
    product: { findMany: vi.fn().mockResolvedValue(products) },
    inventoryAlert: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ id: "a1" }]),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new AlertsService(prisma as unknown as PrismaService);
}

describe("AlertsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates low stock and expiry alerts and resolves stale ones", async () => {
    const prisma = makePrisma([
      {
        id: "p1", name: "Madu", lowStockLimit: 10,
        batches: [
          { id: "b1", batchCode: "B-1", quantity: 3, expiryDate: new Date("2026-10-20T00:00:00.000Z") },
          { id: "b2", batchCode: "B-2", quantity: 2, expiryDate: new Date("2027-01-01T00:00:00.000Z") },
          { id: "b3", batchCode: "B-3", quantity: 1, expiryDate: null },
        ],
      },
      { id: "p2", name: "Teh", lowStockLimit: 5, batches: [{ id: "b4", batchCode: "B-4", quantity: 5, expiryDate: null }] },
    ]);
    const service = makeService(prisma);
    const result = await service.getActiveAlerts("tenant-1");

    expect(result).toEqual([{ id: "a1" }]);
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", deletedAt: null });
    expect(prisma.inventoryAlert.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", resolvedAt: null, fingerprint: { notIn: ["LOW_STOCK:p1", "EXPIRY:b1"] } },
      data: { resolvedAt: NOW },
    });
    expect(prisma.inventoryAlert.upsert).toHaveBeenCalledTimes(2);
    const [low, expiry] = prisma.inventoryAlert.upsert.mock.calls.map((call) => call[0]);
    expect(low.where).toEqual({ tenantId_fingerprint: { tenantId: "tenant-1", fingerprint: "LOW_STOCK:p1" } });
    expect(low.create).toMatchObject({ kind: "LOW_STOCK", quantity: 6, batchId: null, expiresAt: null, observedAt: NOW, tenantId: "tenant-1" });
    expect(low.create.message).toBe("Stok Madu tersisa 6; batas minimum 10.");
    expect(low.update).toMatchObject({ resolvedAt: null, observedAt: NOW });
    expect(expiry.create).toMatchObject({ kind: "EXPIRY", batchId: "b1", quantity: 3, productId: "p1" });
    expect(expiry.create.message).toBe("Batch B-1 dari Madu kedaluwarsa 2026-10-20.");
  });

  it("scopes active alerts query to the given tenant", async () => {
    const prisma = makePrisma();
    await makeService(prisma).getActiveAlerts("tenant-1");
    expect(prisma.inventoryAlert.findMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", resolvedAt: null });
  });

  it("resolves every open alert when nothing is wrong", async () => {
    const prisma = makePrisma([]);
    await makeService(prisma).getActiveAlerts("tenant-1");
    expect(prisma.inventoryAlert.updateMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", resolvedAt: null }, data: { resolvedAt: NOW } });
    expect(prisma.inventoryAlert.upsert).not.toHaveBeenCalled();
  });

  it("flags products without stock and already expired batches", async () => {
    const prisma = makePrisma([
      { id: "p1", name: "Kosong", lowStockLimit: 1, batches: [] },
      { id: "p2", name: "Lama", lowStockLimit: 0, batches: [{ id: "b1", batchCode: "OLD", quantity: 4, expiryDate: new Date("2026-01-01T00:00:00.000Z") }] },
    ]);
    await makeService(prisma).getActiveAlerts("tenant-1");
    const kinds = prisma.inventoryAlert.upsert.mock.calls.map((call) => call[0].create.fingerprint);
    expect(kinds).toEqual(["LOW_STOCK:p1", "EXPIRY:b1"]);
  });

  it("refreshes all tenants on daily cron and logs the total", async () => {
    const prisma = makePrisma([{ id: "p1", name: "Madu", lowStockLimit: 5, batches: [] }], [{ id: "t1" }, { id: "t2" }]);
    await makeService(prisma).refreshDaily();
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.product.findMany.mock.calls[1][0].where.tenantId).toBe("t2");
    expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining("2 alert aktif"));
  });

  it("logs errors from daily cron and module init without throwing", async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockRejectedValueOnce(new Error("db")).mockRejectedValueOnce("not-an-error");
    const service = makeService(prisma);
    await expect(service.refreshDaily()).resolves.toBeUndefined();
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenNthCalledWith(1, "Pemeriksaan alert harian gagal.", expect.any(String));
    expect(Logger.prototype.error).toHaveBeenNthCalledWith(2, "Pemeriksaan alert awal gagal.", undefined);
  });

  it("runs an initial refresh on module init", async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockResolvedValueOnce([{ id: "t1" }]);
    await makeService(prisma).onModuleInit();
    expect(prisma.inventoryAlert.updateMany).toHaveBeenCalledTimes(1);
  });
});
