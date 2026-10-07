import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { ExpensesService } from "./expenses.service";

function makeService(prisma: Record<string, unknown>) {
  const context = new TenantContextService();
  const service = new ExpensesService(prisma as unknown as PrismaService, context);
  return { service, run: <T>(fn: () => T) => context.run("tenant-1", fn) };
}

describe("ExpensesService.list", () => {
  it("filters by inclusive UTC date range when both bounds are given", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ expense: { findMany } });
    await service.list("2026-10-01T15:00:00Z", "2026-10-31");
    expect(findMany).toHaveBeenCalledWith({
      where: { date: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-31T00:00:00.000Z") } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
  });

  it("lists everything without a complete range", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ expense: { findMany } });
    await service.list("2026-10-01");
    await service.list();
    expect(findMany.mock.calls[0][0].where).toEqual({});
    expect(findMany.mock.calls[1][0].where).toEqual({});
  });
});

describe("ExpensesService.create", () => {
  it("stores trimmed fields at UTC midnight with tenant and creator", async () => {
    const create = vi.fn().mockResolvedValue({ id: "e-1" });
    const { service, run } = makeService({ expense: { create } });
    await run(() => service.create({ date: "2026-10-07T20:00:00+07:00", category: " Listrik ", description: " PLN ", amount: 150000 }, "user-1"));
    expect(create).toHaveBeenCalledWith({ data: {
      tenantId: "tenant-1", date: new Date("2026-10-07T00:00:00.000Z"), category: "Listrik", description: "PLN", amount: 150000, createdBy: "user-1",
    } });
  });

  it("allows missing description", async () => {
    const create = vi.fn().mockResolvedValue({ id: "e-1" });
    const { service, run } = makeService({ expense: { create } });
    await run(() => service.create({ date: "2026-10-07", category: "Sewa", amount: 1 }, "user-1"));
    expect(create.mock.calls[0][0].data.description).toBeUndefined();
  });

  it("requires tenant context", () => {
    const { service } = makeService({ expense: { create: vi.fn() } });
    expect(() => service.create({ date: "2026-10-07", category: "Sewa", amount: 1 }, "user-1")).toThrow(NotFoundException);
  });
});

describe("ExpensesService.remove", () => {
  it("deletes or throws when missing", async () => {
    const deleteMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const { service } = makeService({ expense: { deleteMany } });
    await expect(service.remove("e-1")).resolves.toEqual({ deleted: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "e-1" } });
    await expect(service.remove("e-x")).rejects.toBeInstanceOf(NotFoundException);
  });
});
