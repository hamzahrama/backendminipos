import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CustomersService } from "./customers.service";

function setup(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "c1", hniProfile: null }),
      create: vi.fn().mockResolvedValue({ id: "c1" }),
      update: vi.fn().mockResolvedValue({ id: "c1" }),
      delete: vi.fn().mockResolvedValue({ id: "c1" }),
    },
    customerHniProfile: { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    networkNode: { deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    pvLog: { aggregate: vi.fn().mockResolvedValue({ _sum: { pv: 42 } }), findMany: vi.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  prisma.$transaction = vi.fn((callback: (client: typeof prisma) => unknown) => callback(prisma));
  const context = new TenantContextService();
  const service = new CustomersService(prisma as unknown as PrismaService, context);
  return { prisma, service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

describe("CustomersService CRUD", () => {
  it("searches by name, phone and HNI ID", async () => {
    const { prisma, service } = setup();
    await service.list("ani");
    expect(prisma.customer.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
  });

  it("creates a customer with an HNI profile in one transaction", async () => {
    const { prisma, service, run } = setup();
    await run(() => service.create({ name: "  Bu Ani ", phone: "0812", hniId: "HNI001", uplineHniId: "HNI000", birthDate: "1990-05-01" }));
    expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ tenantId: "tenant-1", name: "Bu Ani" });
    expect(prisma.customerHniProfile.create.mock.calls[0][0].data).toMatchObject({ hniId: "HNI001", uplineHniId: "HNI000" });
  });

  it("maps duplicate HNI IDs to conflict", async () => {
    const { prisma, service, run } = setup();
    prisma.customer.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    await expect(run(() => service.create({ name: "Ani" }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("upserts, updates upline only, or removes the HNI profile on update", async () => {
    const { prisma, service, run } = setup();
    await run(() => service.update("c1", { hniId: "HNI002" }));
    expect(prisma.customerHniProfile.upsert).toHaveBeenCalled();
    await run(() => service.update("c1", { hniId: null }));
    expect(prisma.customerHniProfile.deleteMany).toHaveBeenCalled();
    prisma.customer.findUnique.mockResolvedValueOnce({ id: "c1", hniProfile: { hniId: "HNI002" } });
    await run(() => service.update("c1", { uplineHniId: "HNI000" }));
    expect(prisma.customerHniProfile.update.mock.calls[0][0].data).toEqual({ uplineHniId: "HNI000" });
  });

  it("returns a profile with total PV and 404s for unknown customers", async () => {
    const { prisma, service } = setup();
    await expect(service.profile("c1")).resolves.toMatchObject({ id: "c1", totalPv: 42 });
    prisma.customer.findUnique.mockResolvedValueOnce(null);
    await expect(service.profile("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes an existing customer and rebuilds the network for members", async () => {
    const { prisma, service, run } = setup();
    prisma.customer.findUnique.mockResolvedValueOnce({ id: "c1", hniProfile: { hniId: "H1" } });
    await expect(run(() => service.remove("c1"))).resolves.toEqual({ deleted: true });
    expect(prisma.networkNode.deleteMany).toHaveBeenCalled();
  });
});

describe("CustomersService.network", () => {
  const node = (customerId: string, hniId: string, parentCustomerId: string | null, depth = 0) => ({
    customerId, parentCustomerId, depth, externalUplineHniId: null, customer: { name: customerId.toUpperCase(), hniProfile: { hniId } },
  });

  it("rebuilds network_tree when profiles changed and creates links for the tenant", async () => {
    const { prisma, service, run } = setup();
    prisma.customerHniProfile.count.mockResolvedValueOnce(2);
    prisma.networkNode.count.mockResolvedValueOnce(0);
    prisma.customerHniProfile.findMany.mockResolvedValueOnce([
      { customerId: "a", hniId: "H1", uplineHniId: null }, { customerId: "b", hniId: "H2", uplineHniId: "H1" },
    ]);
    await run(() => service.network("2026-10"));
    expect(prisma.networkNode.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(prisma.networkNode.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: "tenant-1", customerId: "a", parentCustomerId: null, depth: 0, externalUplineHniId: null },
      { tenantId: "tenant-1", customerId: "b", parentCustomerId: "a", depth: 1, externalUplineHniId: null },
    ]);
  });

  it("builds the tree with own and group PV from network_tree", async () => {
    const { prisma, service, run } = setup();
    prisma.networkNode.findMany.mockResolvedValueOnce([node("a", "H1", null), node("b", "H2", "a", 1), node("c", "H3", "b", 2)]);
    prisma.pvLog.findMany.mockResolvedValueOnce([{ customerId: "a", pv: 10 }, { customerId: "b", pv: 5 }, { customerId: "c", pv: 2.5 }, { customerId: "zz", pv: 99 }]);
    const result = await run(() => service.network("2026-10"));
    expect(result).toMatchObject({ memberCount: 3, totalPv: 17.5, maxDepth: 3, displayDepthLimit: 5 });
    expect(result.roots[0]).toMatchObject({ id: "a", groupPv: 17.5, downlineCount: 2 });
    expect(prisma.networkNode.deleteMany).not.toHaveBeenCalled();
  });

  it("rebuilds the network when a customer HNI upline changes", async () => {
    const { prisma, service, run } = setup();
    await run(() => service.update("c1", { hniId: "H9", uplineHniId: "H1" }));
    expect(prisma.networkNode.deleteMany).toHaveBeenCalled();
  });

  it("rejects malformed months", async () => {
    const { service, run } = setup();
    await expect(run(() => service.network("10-2026"))).rejects.toBeInstanceOf(ConflictException);
  });
});
