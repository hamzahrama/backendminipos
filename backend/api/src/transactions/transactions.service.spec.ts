import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { VouchersService } from "../vouchers/vouchers.service";
import { TransactionsService } from "./transactions.service";

const products = {
  p1: { id: "p1", name: "Madu", sku: "MH", memberPrice: 50000, retailPrice: 60000, pv: 10 },
  p2: { id: "p2", name: "Minyak", sku: "MHS", memberPrice: 30000, retailPrice: 36000, pv: 5 },
};

function setup(overrides: { existing?: unknown; profile?: unknown; voucher?: unknown; voucherUpdateCount?: number } = {}) {
  const tx = {
    customerHniProfile: { findFirst: vi.fn().mockResolvedValue(overrides.profile ?? null) },
    customer: { findUnique: vi.fn().mockResolvedValue({ id: "cust-1" }) },
    product: { findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(products[where.id as keyof typeof products] ?? null)) },
    voucher: { updateMany: vi.fn().mockResolvedValue({ count: overrides.voucherUpdateCount ?? 1 }) },
    invoiceCounter: { upsert: vi.fn().mockResolvedValue({ nextValue: 7 }) },
    saleTransaction: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "trx-1", ...data })),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve(tx.saleTransaction.create.mock.calls[0][0].data)),
    },
    pvLog: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    saleTransaction: { findUnique: vi.fn().mockResolvedValue(overrides.existing ?? null) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const inventory = { consumeByFefo: vi.fn().mockResolvedValue([]) };
  const vouchers = {
    findAvailable: vi.fn().mockResolvedValue(overrides.voucher ?? { id: "v1", minSubtotal: 0, maxUses: 10 }),
    discountFor: vi.fn().mockReturnValue(10000),
  };
  const context = new TenantContextService();
  const service = new TransactionsService(
    prisma as unknown as PrismaService, inventory as unknown as InventoryService, context, vouchers as unknown as VouchersService,
  );
  return { tx, prisma, inventory, vouchers, service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

const KEY = "idem-key-123";

describe("TransactionsService.checkout", () => {
  it("prices non-member sales at retail without PV and consumes stock by FEFO", async () => {
    const { tx, inventory, service, run } = setup();
    const sale = await run(() => service.checkout({ memberMode: false, items: [{ productId: "p1", quantity: 2 }], cashReceived: 150000 }, KEY, "user-1"));
    expect(sale).toMatchObject({ subtotal: 120000, total: 120000, totalPv: 0, changeAmount: 30000, invoiceNo: expect.stringMatching(/^HNI-\d{8}-000007$/) });
    expect(inventory.consumeByFefo).toHaveBeenCalledWith(tx, "p1", 2, expect.objectContaining({ userId: "user-1" }));
    expect(tx.pvLog.create).not.toHaveBeenCalled();
  });

  it("prices member sales at member price and writes PV logs to the member", async () => {
    const { tx, service, run } = setup({ profile: { customerId: "cust-1" } });
    const sale = await run(() => service.checkout({
      memberMode: true, memberHniId: "HNI001", items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }], cashReceived: 130000,
    }, KEY, "user-1"));
    expect(sale).toMatchObject({ subtotal: 130000, totalPv: 25, customerId: "cust-1", memberHniId: "HNI001" });
    expect(tx.pvLog.create).toHaveBeenCalledTimes(2);
    expect(tx.pvLog.create.mock.calls[0][0].data).toMatchObject({ tenantId: "tenant-1", customerId: "cust-1", pv: 20 });
  });

  it("applies item, order and voucher discounts and flags high discounts for review", async () => {
    const { tx, service, run } = setup();
    const sale = await run(() => service.checkout({
      memberMode: false, items: [{ productId: "p1", quantity: 1, discountAmount: 20000 }], discountAmount: 15000, voucherCode: "hemat", cashReceived: 100000,
    }, KEY, "user-1"));
    expect(sale).toMatchObject({ subtotal: 60000, discount: 45000, total: 15000, voucherCode: "HEMAT" });
    expect(tx.voucher.updateMany).toHaveBeenCalled();
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "REVIEW_HIGH_DISCOUNT" });
  });

  it("returns the existing sale for a repeated idempotency key", async () => {
    const existing = { id: "trx-old", invoiceNo: "HNI-1" };
    const { prisma, service, run } = setup({ existing });
    await expect(run(() => service.checkout({ memberMode: false, items: [{ productId: "p1", quantity: 1 }], cashReceived: 60000 }, KEY, "u"))).resolves.toBe(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["short idempotency key", { memberMode: false, items: [{ productId: "p1", quantity: 1 }], cashReceived: 60000 }, "short"],
    ["member mode without HNI ID", { memberMode: true, items: [{ productId: "p1", quantity: 1 }], cashReceived: 60000 }, KEY],
    ["HNI ID in non-member mode", { memberMode: false, memberHniId: "HNI001", items: [{ productId: "p1", quantity: 1 }], cashReceived: 60000 }, KEY],
    ["duplicate product lines", { memberMode: false, items: [{ productId: "p1", quantity: 1 }, { productId: "p1", quantity: 1 }], cashReceived: 120000 }, KEY],
    ["insufficient cash", { memberMode: false, items: [{ productId: "p1", quantity: 1 }], cashReceived: 1000 }, KEY],
    ["item discount above line value", { memberMode: false, items: [{ productId: "p1", quantity: 1, discountAmount: 70000 }], cashReceived: 60000 }, KEY],
    ["order discount above subtotal", { memberMode: false, items: [{ productId: "p1", quantity: 1 }], discountAmount: 70000, cashReceived: 60000 }, KEY],
  ])("rejects %s", async (_label, input, key) => {
    const { service, run } = setup();
    await expect(run(() => service.checkout(input as never, key, "u"))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unknown products and unregistered HNI IDs", async () => {
    const { service, run } = setup();
    await expect(run(() => service.checkout({ memberMode: false, items: [{ productId: "nope", quantity: 1 }], cashReceived: 1 }, KEY, "u"))).rejects.toBeInstanceOf(NotFoundException);
    await expect(run(() => service.checkout({ memberMode: true, memberHniId: "HNI999", items: [{ productId: "p1", quantity: 1 }], cashReceived: 1e6 }, KEY, "u"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a member ID that belongs to a different selected customer", async () => {
    const { service, run } = setup({ profile: { customerId: "cust-2" } });
    await expect(run(() => service.checkout({ memberMode: true, memberHniId: "HNI001", customerId: "cust-1", items: [{ productId: "p1", quantity: 1 }], cashReceived: 1e6 }, KEY, "u"))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports voucher quota race as conflict", async () => {
    const { service, run } = setup({ voucherUpdateCount: 0 });
    await expect(run(() => service.checkout({ memberMode: false, items: [{ productId: "p1", quantity: 1 }], voucherCode: "X", cashReceived: 1e6 }, KEY, "u"))).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps serialization failures to a retryable conflict", async () => {
    const { prisma, service, run } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "5" }));
    await expect(run(() => service.checkout({ memberMode: false, items: [{ productId: "p1", quantity: 1 }], cashReceived: 1e6 }, KEY, "u"))).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns the concurrent duplicate when the idempotency key collides", async () => {
    const { prisma, service, run } = setup();
    const duplicate = { id: "trx-dup" };
    prisma.saleTransaction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate);
    prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    await expect(run(() => service.checkout({ memberMode: false, items: [{ productId: "p1", quantity: 1 }], cashReceived: 1e6 }, KEY, "u"))).resolves.toBe(duplicate);
  });
});

describe("TransactionsService.publicReceipt", () => {
  it("rejects malformed tokens without querying", async () => {
    const { prisma, service } = setup();
    await expect(service.publicReceipt("bad")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.saleTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("returns a receipt for a valid token", async () => {
    const { prisma, service } = setup();
    prisma.saleTransaction.findUnique.mockResolvedValueOnce({ invoiceNo: "HNI-1" });
    await expect(service.publicReceipt("a".repeat(43))).resolves.toEqual({ invoiceNo: "HNI-1" });
  });
});
