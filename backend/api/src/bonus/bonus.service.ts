import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomersService } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { BonusSchemeConfig, computeBonuses, EngineNode, EXAMPLE_BONUS_SCHEME, simulateScenario } from "./bonus-engine";
import { BonusSchemeDto, SimulateBonusDto } from "./bonus.dto";

@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly customers: CustomersService,
  ) {}

  async getScheme(): Promise<BonusSchemeConfig & { updatedAt: Date | null }> {
    const stored = await this.prisma.bonusScheme.findFirst({ select: { config: true, updatedAt: true } });
    if (!stored) return { ...EXAMPLE_BONUS_SCHEME, updatedAt: null };
    return { ...(stored.config as unknown as BonusSchemeConfig), updatedAt: stored.updatedAt };
  }

  async saveScheme(input: BonusSchemeDto, userId: string) {
    const tenantId = this.requireTenantId();
    const codes = new Set(input.ranks.map((rank) => rank.code));
    if (codes.size !== input.ranks.length) throw new BadRequestException("Kode peringkat tidak boleh sama.");
    const config: BonusSchemeConfig = {
      name: input.name.trim(), isExample: input.isExample ?? false, pvValue: input.pvValue,
      ranks: [...input.ranks].sort((a, b) => a.minOwnPv - b.minOwnPv || a.minGroupPv - b.minGroupPv)
        .map((rank) => ({ ...rank, name: rank.name.trim() })),
      badges: [...input.badges].sort((a, b) => a.minPv - b.minPv).map((badge) => ({ ...badge, name: badge.name.trim() })),
    };
    const json = config as unknown as Prisma.InputJsonValue;
    await this.prisma.bonusScheme.upsert({
      where: { tenantId }, create: { tenantId, config: json, updatedBy: userId }, update: { config: json, updatedBy: userId },
    });
    return this.getScheme();
  }

  async leaderboard(month: string) {
    const { nodes, pv } = await this.loadNetwork(month);
    const scheme = await this.getScheme();
    const bonuses = computeBonuses(nodes, pv, scheme);
    const rows = [...bonuses.values()]
      .sort((a, b) => b.ownPv - a.ownPv || b.groupPv - a.groupPv || a.name.localeCompare(b.name))
      .slice(0, 50)
      .map((row, index) => ({ position: index + 1, customerId: row.customerId, name: row.name, hniId: row.hniId, ownPv: row.ownPv, groupPv: row.groupPv, rank: row.rank, badge: row.badge }));
    return { month, scheme: { name: scheme.name, isExample: scheme.isExample }, badges: scheme.badges, rows };
  }

  async memberBonus(month: string, customerId: string) {
    const { nodes, pv } = await this.loadNetwork(month);
    const scheme = await this.getScheme();
    const bonus = computeBonuses(nodes, pv, scheme).get(customerId);
    if (!bonus) throw new NotFoundException("Member tidak ditemukan di jaringan toko ini.");
    return { month, scheme: { name: scheme.name, isExample: scheme.isExample }, bonus };
  }

  async simulate(input: SimulateBonusDto) {
    const { nodes, pv } = await this.loadNetwork(input.month);
    const scheme = await this.getScheme();
    for (const change of input.changes) {
      if (change.ownPv === undefined && !change.targetRankCode) throw new BadRequestException("Setiap skenario wajib berisi PV baru atau target peringkat.");
      if (change.targetRankCode && !scheme.ranks.some((rank) => rank.code === change.targetRankCode)) throw new BadRequestException(`Peringkat ${change.targetRankCode} tidak ada di skema.`);
    }
    const result = simulateScenario(nodes, pv, scheme, input.customerId, input.changes);
    if (!result) throw new NotFoundException("Member tidak ditemukan di jaringan toko ini.");
    return { month: input.month, scheme: { name: scheme.name, isExample: scheme.isExample, pvValue: scheme.pvValue }, ...result };
  }

  private async loadNetwork(month: string): Promise<{ nodes: EngineNode[]; pv: Map<string, number> }> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException("Bulan harus berformat YYYY-MM.");
    const tenantId = this.requireTenantId();
    const [year, monthNumber] = month.split("-").map(Number);
    const from = new Date(`${month}-01T00:00:00+07:00`);
    const to = new Date(Date.UTC(year, monthNumber, 1) - 7 * 60 * 60 * 1000 - 1);
    const [profileCount, nodeCount] = await Promise.all([this.prisma.customerHniProfile.count(), this.prisma.networkNode.count()]);
    if (profileCount !== nodeCount) await this.prisma.$transaction((tx) => this.customers.rebuildNetwork(tx, tenantId));
    const [rows, logs] = await Promise.all([
      this.prisma.networkNode.findMany({ select: { customerId: true, parentCustomerId: true, customer: { select: { name: true, hniProfile: { select: { hniId: true } } } } } }),
      this.prisma.pvLog.findMany({ where: { createdAt: { gte: from, lte: to }, customerId: { not: null } }, select: { customerId: true, pv: true } }),
    ]);
    const pv = new Map<string, number>();
    for (const log of logs) if (log.customerId) pv.set(log.customerId, (pv.get(log.customerId) ?? 0) + Number(log.pv));
    const nodes = rows.filter((row) => row.customer.hniProfile).map((row) => ({
      customerId: row.customerId, parentCustomerId: row.parentCustomerId, name: row.customer.name, hniId: row.customer.hniProfile!.hniId,
    }));
    return { nodes, pv };
  }

  private requireTenantId() {
    const id = this.tenantContext.getTenantId();
    if (!id) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return id;
  }
}
