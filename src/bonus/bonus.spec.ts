import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CustomersService } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { badgeFor, BonusSchemeConfig, computeBonuses, EXAMPLE_BONUS_SCHEME, rankFor, simulateScenario } from "./bonus-engine";
import { BonusService } from "./bonus.service";

const scheme: BonusSchemeConfig = {
  name: "Uji", isExample: false, pvValue: 1000,
  ranks: [
    { code: "A", name: "Agen", minOwnPv: 10, minGroupPv: 0, personalRate: 0.1, generationRates: [0.05] },
    { code: "B", name: "Perak", minOwnPv: 20, minGroupPv: 50, personalRate: 0.2, generationRates: [0.1, 0.05] },
  ],
  badges: [{ name: "Bronze", minPv: 10 }, { name: "Gold", minPv: 30 }],
};
// root → (x → z), y
const nodes = [
  { customerId: "root", parentCustomerId: null, name: "Root", hniId: "H0" },
  { customerId: "x", parentCustomerId: "root", name: "X", hniId: "H1" },
  { customerId: "y", parentCustomerId: "root", name: "Y", hniId: "H2" },
  { customerId: "z", parentCustomerId: "x", name: "Z", hniId: "H3" },
];

describe("bonus engine", () => {
  it("picks the highest qualifying rank and badge", () => {
    expect(rankFor(scheme, 25, 60)?.code).toBe("B");
    expect(rankFor(scheme, 25, 10)?.code).toBe("A");
    expect(rankFor(scheme, 5, 999)).toBeNull();
    expect(badgeFor(scheme, 35)).toBe("Gold");
    expect(badgeFor(scheme, 1)).toBeNull();
  });

  it("computes personal and generation bonuses per rank", () => {
    const pv = new Map([["root", 20], ["x", 10], ["y", 15], ["z", 10]]);
    const root = computeBonuses(nodes, pv, scheme).get("root")!;
    expect(root.groupPv).toBe(55);
    expect(root.rank?.code).toBe("B");
    expect(root.personalBonus).toBe(4000); // 20 PV × 1000 × 20%
    expect(root.generationBonus).toEqual([
      { generation: 1, pv: 25, rate: 0.1, bonus: 2500 },
      { generation: 2, pv: 10, rate: 0.05, bonus: 500 },
    ]);
    expect(root.totalBonus).toBe(7000);
  });

  it("pays nothing to members below the first rank", () => {
    const result = computeBonuses(nodes, new Map([["z", 5]]), scheme).get("z")!;
    expect(result).toMatchObject({ rank: null, totalBonus: 0 });
  });

  it("simulates a downline reaching a target rank", () => {
    const pv = new Map([["root", 20], ["x", 10], ["y", 5], ["z", 0]]);
    const result = simulateScenario(nodes, pv, scheme, "root", [{ customerId: "y", targetRankCode: "B" }, { customerId: "z", ownPv: 30 }])!;
    expect(result.member.before.rank?.code).toBe("A");
    expect(result.member.before.groupPv).toBe(35);
    expect(result.member.after.groupPv).toBe(80);
    expect(result.member.after.rank?.code).toBe("B");
    expect(result.member.difference).toBe(result.member.after.totalBonus - result.member.before.totalBonus);
    expect(result.changes[0]).toMatchObject({ customerId: "y", fromPv: 5, toPv: 20, rankBefore: null, rankAfter: { code: "A" } });
  });

  it("returns null for unknown members and ignores unknown changes", () => {
    expect(simulateScenario(nodes, new Map(), scheme, "nobody", [])).toBeNull();
    expect(simulateScenario(nodes, new Map(), scheme, "root", [{ customerId: "ghost", ownPv: 10 }])!.changes).toEqual([]);
  });

  it("ships an example scheme that is clearly labelled", () => {
    expect(EXAMPLE_BONUS_SCHEME.isExample).toBe(true);
    expect(EXAMPLE_BONUS_SCHEME.name).toMatch(/bukan rumus resmi/);
  });
});

function setup(stored: unknown = null) {
  const prisma = {
    bonusScheme: { findFirst: vi.fn().mockResolvedValue(stored), upsert: vi.fn().mockResolvedValue({}) },
    customerHniProfile: { count: vi.fn().mockResolvedValue(4) },
    networkNode: {
      count: vi.fn().mockResolvedValue(4),
      findMany: vi.fn().mockResolvedValue(nodes.map((node) => ({ customerId: node.customerId, parentCustomerId: node.parentCustomerId, customer: { name: node.name, hniProfile: { hniId: node.hniId } } }))),
    },
    pvLog: { findMany: vi.fn().mockResolvedValue([{ customerId: "root", pv: 20 }, { customerId: "x", pv: 10 }, { customerId: "y", pv: 15 }, { customerId: "z", pv: 10 }]) },
    $transaction: vi.fn(),
  };
  const customers = { rebuildNetwork: vi.fn() };
  const context = new TenantContextService();
  const service = new BonusService(prisma as unknown as PrismaService, context, customers as unknown as CustomersService);
  return { prisma, customers, service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

describe("BonusService", () => {
  it("falls back to the example scheme and saves a sorted custom scheme", async () => {
    const { prisma, service, run } = setup();
    expect((await run(() => service.getScheme())).isExample).toBe(true);
    await run(() => service.saveScheme({ name: " Plan ", pvValue: 500, ranks: [...scheme.ranks].reverse(), badges: [...scheme.badges].reverse() }, "user-1"));
    const saved = prisma.bonusScheme.upsert.mock.calls[0][0];
    expect(saved.where).toEqual({ tenantId: "tenant-1" });
    expect(saved.create.config.ranks.map((rank: { code: string }) => rank.code)).toEqual(["A", "B"]);
    expect(saved.create.config.name).toBe("Plan");
  });

  it("rejects duplicate rank codes", async () => {
    const { service, run } = setup();
    await expect(run(() => service.saveScheme({ name: "X", pvValue: 1, ranks: [scheme.ranks[0], scheme.ranks[0]], badges: [] }, "u"))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("builds a PV leaderboard with ranks and badges", async () => {
    const { service, run } = setup({ config: scheme, updatedAt: new Date() });
    const board = await run(() => service.leaderboard("2026-10"));
    expect(board.rows.map((row) => row.customerId)).toEqual(["root", "y", "x", "z"]);
    expect(board.rows[0]).toMatchObject({ position: 1, badge: "Bronze", rank: { code: "B" } });
  });

  it("returns a member bonus and simulates scenarios", async () => {
    const { service, run } = setup({ config: scheme, updatedAt: new Date() });
    expect((await run(() => service.memberBonus("2026-10", "root"))).bonus.totalBonus).toBe(7000);
    const simulation = await run(() => service.simulate({ month: "2026-10", customerId: "root", changes: [{ customerId: "z", ownPv: 40 }] }));
    expect(simulation.member.difference).toBe(1500);
    await expect(run(() => service.memberBonus("2026-10", "ghost"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("validates scenarios and rebuilds a stale network", async () => {
    const { prisma, service, run } = setup({ config: scheme, updatedAt: new Date() });
    await expect(run(() => service.simulate({ month: "2026-10", customerId: "root", changes: [{ customerId: "z" }] }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(() => service.simulate({ month: "2026-10", customerId: "root", changes: [{ customerId: "z", targetRankCode: "ZZ" }] }))).rejects.toBeInstanceOf(BadRequestException);
    prisma.networkNode.count.mockResolvedValueOnce(1);
    await run(() => service.leaderboard("2026-10"));
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
