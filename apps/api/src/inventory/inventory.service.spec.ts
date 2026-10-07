import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { InventoryService } from "./inventory.service";

const uniqueError = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" });

function makeService(prisma: Record<string, unknown>) {
  const context = new TenantContextService();
  const fake = prisma as Record<string, unknown> & { $transaction?: unknown };
  if (!fake.$transaction) fake.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(fake));
  const service = new InventoryService(fake as unknown as PrismaService, context);
  return { service, prisma: fake, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

const batch = (id: string, quantity: number, expiry: string | null, warehouseId = "wh-1") => ({
  id, batchCode: id.toUpperCase(), warehouseId, quantity, expiryDate: expiry ? new Date(expiry) : null,
});

describe("InventoryService warehouses", () => {
  it("lists warehouses default first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ warehouse: { findMany } });
    await service.listWarehouses();
    expect(findMany).toHaveBeenCalledWith({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  });

  it("creates the first warehouse as default with normalized code", async () => {
    const create = vi.fn().mockResolvedValue({ id: "wh-1" });
    const { service, run } = makeService({ warehouse: { count: vi.fn().mockResolvedValue(0), create } });
    await run(() => service.createWarehouse({ name: "  Gudang A ", code: " main-1 " }));
    expect(create).toHaveBeenCalledWith({ data: { tenantId: "tenant-1", name: "Gudang A", code: "MAIN-1", isDefault: true } });
  });

  it("creates later warehouses as non-default", async () => {
    const create = vi.fn().mockResolvedValue({ id: "wh-2" });
    const { service, run } = makeService({ warehouse: { count: vi.fn().mockResolvedValue(2), create } });
    await run(() => service.createWarehouse({ name: "Cabang", code: "CB" }));
    expect(create.mock.calls[0][0].data.isDefault).toBe(false);
  });

  it.each([
    [{ name: "  ", code: "MAIN" }],
    [{ name: "Gudang", code: "A" }],
    [{ name: "Gudang", code: "BAD CODE" }],
  ])("rejects invalid input %j", async (input) => {
    const { service, run } = makeService({});
    await expect(run(() => service.createWarehouse(input))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires tenant context", async () => {
    const { service } = makeService({ warehouse: { count: vi.fn() } });
    await expect(service.createWarehouse({ name: "Gudang", code: "MAIN" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps duplicate code to conflict and rethrows other errors", async () => {
    const create = vi.fn().mockRejectedValueOnce(uniqueError()).mockRejectedValueOnce(new Error("db down"));
    const { service, run } = makeService({ warehouse: { count: vi.fn().mockResolvedValue(1), create } });
    await expect(run(() => service.createWarehouse({ name: "Gudang", code: "MAIN" }))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.createWarehouse({ name: "Gudang", code: "MAIN" }))).rejects.toThrow("db down");
  });
});

describe("InventoryService.receiveStock", () => {
  const product = { id: "p-1" };
  const warehouse = { id: "wh-1", code: "MAIN" };

  function stockPrisma(overrides: Record<string, unknown> = {}) {
    return {
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      warehouse: {
        findUnique: vi.fn().mockResolvedValue(warehouse),
        findFirst: vi.fn().mockResolvedValue(warehouse),
        upsert: vi.fn().mockResolvedValue({ id: "wh-new" }),
      },
      productBatch: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "b-new", ...data })),
        update: vi.fn().mockResolvedValue({ id: "b-old" }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
      ...overrides,
    };
  }

  it("creates a new batch in the default warehouse and records an IN movement", async () => {
    const prisma = stockPrisma();
    const { service, run } = makeService(prisma);
    const result = await run(() => service.receiveStock(
      { productId: "p-1", batchCode: " B1 ", quantity: 5, expiryDate: "2027-01-31T10:00:00Z", unitCost: 1000, note: "awal" }, "user-1",
    ));
    expect(result).toMatchObject({ id: "b-new", batchCode: "B1", quantity: 5 });
    expect(prisma.productBatch.create.mock.calls[0][0].data.expiryDate).toEqual(new Date("2027-01-31T00:00:00.000Z"));
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({ data: {
      tenantId: "tenant-1", productId: "p-1", batchId: "b-new", warehouseId: "wh-1", type: "IN", quantity: 5, note: "awal", createdBy: "user-1",
    } });
  });

  it("uses the selected warehouse and fails when it does not exist", async () => {
    const prisma = stockPrisma();
    const { service, run } = makeService(prisma);
    await run(() => service.receiveStock({ productId: "p-1", warehouseId: "wh-1", batchCode: "B1", quantity: 1 }));
    expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({ where: { id: "wh-1" } });
    prisma.warehouse.findUnique.mockResolvedValueOnce(null);
    await expect(run(() => service.receiveStock({ productId: "p-1", warehouseId: "nope", batchCode: "B1", quantity: 1 })))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates the MAIN warehouse when the tenant has none", async () => {
    const prisma = stockPrisma();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    const { service, run } = makeService(prisma);
    await run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 1 }));
    expect(prisma.warehouse.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_code: { tenantId: "tenant-1", code: "MAIN" } },
      create: { tenantId: "tenant-1", name: "Gudang Utama", code: "MAIN", isDefault: true },
    }));
    expect(prisma.productBatch.create.mock.calls[0][0].data).toMatchObject({ warehouseId: "wh-new", expiryDate: null });
  });

  it("increments an existing batch with matching expiry and cost", async () => {
    const prisma = stockPrisma();
    prisma.productBatch.findUnique.mockResolvedValue({ id: "b-old", expiryDate: new Date("2027-01-31T00:00:00.000Z"), unitCost: 1000 });
    const { service, run } = makeService(prisma);
    await run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 3, expiryDate: "2027-01-31", unitCost: 1000 }));
    expect(prisma.productBatch.update).toHaveBeenCalledWith({
      where: { id: "b-old" },
      data: { quantity: { increment: 3 }, receivedQuantity: { increment: 3 } },
      include: { warehouse: true },
    });
    expect(prisma.stockMovement.create.mock.calls[0][0].data.batchId).toBe("b-old");
  });

  it("rejects an existing batch with a different expiry or unit cost", async () => {
    const prisma = stockPrisma();
    const { service, run } = makeService(prisma);
    prisma.productBatch.findUnique.mockResolvedValueOnce({ id: "b-old", expiryDate: null, unitCost: 1000 });
    await expect(run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 1, expiryDate: "2027-01-31" })))
      .rejects.toThrow(/kedaluwarsa berbeda/);
    prisma.productBatch.findUnique.mockResolvedValueOnce({ id: "b-old", expiryDate: null, unitCost: 1000 });
    await expect(run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 1, unitCost: 900 })))
      .rejects.toThrow(/harga pokok berbeda/);
    expect(prisma.productBatch.update).not.toHaveBeenCalled();
  });

  it("rejects archived/missing products and missing tenant", async () => {
    const prisma = stockPrisma();
    prisma.product.findFirst.mockResolvedValue(null);
    const { service, run } = makeService(prisma);
    await expect(run(() => service.receiveStock({ productId: "x", batchCode: "B1", quantity: 1 }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.receiveStock({ productId: "x", batchCode: "B1", quantity: 1 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps unique races to conflict and rethrows others", async () => {
    const prisma = stockPrisma();
    prisma.productBatch.create.mockRejectedValueOnce(uniqueError()).mockRejectedValueOnce(new Error("boom"));
    const { service, run } = makeService(prisma);
    await expect(run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 1 }))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.receiveStock({ productId: "p-1", batchCode: "B1", quantity: 1 }))).rejects.toThrow("boom");
  });
});

describe("InventoryService batches and summary", () => {
  it("lists batches of an existing product ordered by expiry", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    await expect(service.listProductBatches("p-1")).resolves.toEqual([{ id: "b1" }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { productId: "p-1" } }));
  });

  it("throws when listing batches of a missing product", async () => {
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.listProductBatches("p-x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sums batch quantities per product", async () => {
    const { service } = makeService({ product: { findMany: vi.fn().mockResolvedValue([
      { id: "p-1", name: "Madu", sku: "MH", lowStockLimit: 5, batches: [{ quantity: "2.5" }, { quantity: 3 }] },
      { id: "p-2", name: "Kopi", sku: "KP", lowStockLimit: 1, batches: [] },
    ]) } });
    await expect(service.stockSummary()).resolves.toEqual([
      { id: "p-1", name: "Madu", sku: "MH", lowStockLimit: 5, quantity: 5.5 },
      { id: "p-2", name: "Kopi", sku: "KP", lowStockLimit: 1, quantity: 0 },
    ]);
  });
});

describe("InventoryService FEFO", () => {
  it("previews allocations earliest expiry first, spilling into later and no-expiry batches", async () => {
    const findMany = vi.fn().mockResolvedValue([
      batch("b-early", 2, "2026-11-01"), batch("b-late", 3, "2027-05-01"), batch("b-none", 10, null),
    ]);
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    const result = await service.previewFefo({ productId: "p-1", quantity: 7 });
    expect(result.requestedQuantity).toBe(7);
    expect(result.allocations.map(({ batchId, quantity }) => [batchId, quantity])).toEqual([["b-early", 2], ["b-late", 3], ["b-none", 2]]);
    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }]);
    expect(args.where.quantity).toEqual({ gt: 0 });
    expect(args.where.OR[0]).toEqual({ expiryDate: null });
    expect(args.where.OR[1].expiryDate.gte.getUTCHours()).toBe(0);
    expect(args.where).not.toHaveProperty("warehouseId");
  });

  it("filters by warehouse and stops at the first batch when it covers the request", async () => {
    const findMany = vi.fn().mockResolvedValue([batch("b1", 10, "2026-12-01", "wh-2"), batch("b2", 10, null, "wh-2")]);
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    const result = await service.previewFefo({ productId: "p-1", quantity: 4, warehouseId: "wh-2" });
    expect(result.allocations).toEqual([{ batchId: "b1", batchCode: "B1", warehouseId: "wh-2", quantity: 4, expiryDate: new Date("2026-12-01") }]);
    expect(findMany.mock.calls[0][0].where.warehouseId).toBe("wh-2");
  });

  it("fails preview for a missing product", async () => {
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.previewFefo({ productId: "x", quantity: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects insufficient stock with available/requested amounts", async () => {
    const findMany = vi.fn().mockResolvedValue([batch("b1", 2, "2026-12-01"), batch("b2", 1, null)]);
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    await expect(service.previewFefo({ productId: "p-1", quantity: 4 })).rejects.toThrow("Stok tidak cukup. Tersedia 3, diminta 4.");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects non-positive quantity %s", async (quantity) => {
    const findMany = vi.fn();
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    await expect(service.previewFefo({ productId: "p-1", quantity })).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("does not reject a fully-covered decimal request because of float drift (0.7 + 0.1)", async () => {
    const findMany = vi.fn().mockResolvedValue([batch("b1", 0.7, "2026-12-01"), batch("b2", 0.1, null)]);
    const { service } = makeService({ product: { findFirst: vi.fn().mockResolvedValue({ id: "p-1" }) }, productBatch: { findMany } });
    const result = await service.previewFefo({ productId: "p-1", quantity: 0.8 });
    expect(result.allocations.map(({ quantity }) => quantity)).toEqual([0.7, 0.1]);
  });

  it("consumes multiple batches atomically and records OUT movements", async () => {
    const tx = {
      productBatch: {
        findMany: vi.fn().mockResolvedValue([batch("b1", 2, "2026-11-01"), batch("b2", 5, null, "wh-2")]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, run } = makeService({});
    const result = await run(() => service.consumeByFefo(tx as unknown as Prisma.TransactionClient, "p-1", 4, { reference: "INV-1", userId: "u-1" }));
    expect(result.map(({ batchId, quantity }) => [batchId, quantity])).toEqual([["b1", 2], ["b2", 2]]);
    expect(tx.productBatch.updateMany).toHaveBeenNthCalledWith(1, { where: { id: "b1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(tx.productBatch.updateMany).toHaveBeenNthCalledWith(2, { where: { id: "b2", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, { data: {
      tenantId: "tenant-1", productId: "p-1", batchId: "b2", warehouseId: "wh-2", type: "OUT", quantity: 2, reference: "INV-1", createdBy: "u-1",
    } });
  });

  it("raises a conflict when a batch changed concurrently", async () => {
    const tx = {
      productBatch: {
        findMany: vi.fn().mockResolvedValue([batch("b1", 2, "2026-11-01")]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      stockMovement: { create: vi.fn() },
    };
    const { service, run } = makeService({});
    await expect(run(() => service.consumeByFefo(tx as unknown as Prisma.TransactionClient, "p-1", 1))).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("requires tenant context to consume stock", async () => {
    const tx = { productBatch: { findMany: vi.fn().mockResolvedValue([batch("b1", 2, null)]), updateMany: vi.fn() } };
    const { service } = makeService({});
    await expect(service.consumeByFefo(tx as unknown as Prisma.TransactionClient, "p-1", 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.productBatch.updateMany).not.toHaveBeenCalled();
  });
});
