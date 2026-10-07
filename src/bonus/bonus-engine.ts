export type BonusRank = {
  code: string; name: string; minOwnPv: number; minGroupPv: number;
  /** Share (0–1) of own PV value paid as personal bonus. */
  personalRate: number;
  /** Share (0–1) of each generation's PV value; index 0 = direct downlines. */
  generationRates: number[];
};
export type BonusBadge = { name: string; minPv: number };
export type BonusSchemeConfig = { name: string; isExample: boolean; pvValue: number; ranks: BonusRank[]; badges: BonusBadge[] };

export type EngineNode = { customerId: string; parentCustomerId: string | null; name: string; hniId: string };
export type MemberBonus = {
  customerId: string; name: string; hniId: string; ownPv: number; groupPv: number;
  rank: { code: string; name: string } | null; badge: string | null;
  personalBonus: number; generationBonus: Array<{ generation: number; pv: number; rate: number; bonus: number }>; totalBonus: number;
};

/** Example scheme only — must be replaced by the owner with the official HPAI marketing plan. */
export const EXAMPLE_BONUS_SCHEME: BonusSchemeConfig = {
  name: "Contoh skema (bukan rumus resmi HPAI)", isExample: true, pvValue: 1000,
  ranks: [
    { code: "AGEN", name: "Agen", minOwnPv: 25, minGroupPv: 0, personalRate: 0.1, generationRates: [0.05] },
    { code: "AGEN_PERAK", name: "Agen Perak", minOwnPv: 50, minGroupPv: 250, personalRate: 0.12, generationRates: [0.06, 0.03] },
    { code: "AGEN_EMAS", name: "Agen Emas", minOwnPv: 100, minGroupPv: 1000, personalRate: 0.15, generationRates: [0.07, 0.04, 0.02] },
  ],
  badges: [{ name: "Bronze", minPv: 25 }, { name: "Silver", minPv: 100 }, { name: "Gold", minPv: 250 }, { name: "Diamond", minPv: 500 }],
};

const money = (value: number) => Math.round(value);
const round = (value: number) => Math.round(value * 100) / 100;

export function rankFor(config: BonusSchemeConfig, ownPv: number, groupPv: number) {
  return [...config.ranks]
    .sort((a, b) => b.minOwnPv - a.minOwnPv || b.minGroupPv - a.minGroupPv)
    .find((rank) => ownPv >= rank.minOwnPv && groupPv >= rank.minGroupPv) ?? null;
}

export function badgeFor(config: BonusSchemeConfig, ownPv: number) {
  return [...config.badges].sort((a, b) => b.minPv - a.minPv).find((badge) => ownPv >= badge.minPv)?.name ?? null;
}

/** Computes rank, badge and bonus breakdown for every member of the network. */
export function computeBonuses(nodes: EngineNode[], ownPv: Map<string, number>, config: BonusSchemeConfig): Map<string, MemberBonus> {
  const ids = new Set(nodes.map((node) => node.customerId));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentCustomerId && ids.has(node.parentCustomerId)) children.set(node.parentCustomerId, [...(children.get(node.parentCustomerId) ?? []), node.customerId]);
  }
  const groupPv = new Map<string, number>();
  const groupOf = (id: string, path = new Set<string>()): number => {
    const known = groupPv.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0;
    path.add(id);
    const value = (ownPv.get(id) ?? 0) + (children.get(id) ?? []).reduce((sum, child) => sum + groupOf(child, path), 0);
    groupPv.set(id, value);
    return value;
  };
  const maxGenerations = Math.max(0, ...config.ranks.map((rank) => rank.generationRates.length));
  const result = new Map<string, MemberBonus>();
  for (const node of nodes) {
    const own = ownPv.get(node.customerId) ?? 0;
    const group = groupOf(node.customerId);
    const rank = rankFor(config, own, group);
    const generationPv: number[] = [];
    let frontier = children.get(node.customerId) ?? [];
    const seen = new Set<string>([node.customerId]);
    for (let generation = 0; generation < maxGenerations && frontier.length; generation += 1) {
      frontier = frontier.filter((id) => !seen.has(id));
      frontier.forEach((id) => seen.add(id));
      generationPv.push(frontier.reduce((sum, id) => sum + (ownPv.get(id) ?? 0), 0));
      frontier = frontier.flatMap((id) => children.get(id) ?? []);
    }
    const generationBonus = (rank?.generationRates ?? []).map((rate, index) => ({
      generation: index + 1, pv: round(generationPv[index] ?? 0), rate, bonus: money((generationPv[index] ?? 0) * config.pvValue * rate),
    }));
    const personalBonus = rank ? money(own * config.pvValue * rank.personalRate) : 0;
    result.set(node.customerId, {
      customerId: node.customerId, name: node.name, hniId: node.hniId, ownPv: round(own), groupPv: round(group),
      rank: rank ? { code: rank.code, name: rank.name } : null, badge: badgeFor(config, own),
      personalBonus, generationBonus, totalBonus: personalBonus + generationBonus.reduce((sum, item) => sum + item.bonus, 0),
    });
  }
  return result;
}

export type ScenarioChange = { customerId: string; ownPv?: number; targetRankCode?: string };

/** Applies "what-if" changes (new own PV or a target rank for a downline) and compares the member's bonus. */
export function simulateScenario(nodes: EngineNode[], ownPv: Map<string, number>, config: BonusSchemeConfig, memberId: string, changes: ScenarioChange[]) {
  const baseline = computeBonuses(nodes, ownPv, config);
  const before = baseline.get(memberId);
  if (!before) return null;
  const scenarioPv = new Map(ownPv);
  const applied: Array<{ customerId: string; name: string; fromPv: number; toPv: number }> = [];
  for (const change of changes) {
    const node = baseline.get(change.customerId);
    if (!node) continue;
    let target = change.ownPv;
    if (target === undefined && change.targetRankCode) {
      const rank = config.ranks.find((item) => item.code === change.targetRankCode);
      if (rank) target = Math.max(node.ownPv, rank.minOwnPv);
    }
    if (target === undefined || target < 0) continue;
    scenarioPv.set(change.customerId, target);
    applied.push({ customerId: change.customerId, name: node.name, fromPv: node.ownPv, toPv: round(target) });
  }
  const scenario = computeBonuses(nodes, scenarioPv, config);
  const after = scenario.get(memberId)!;
  return {
    member: { before, after, difference: after.totalBonus - before.totalBonus },
    changes: applied.map((item) => ({
      ...item, rankBefore: baseline.get(item.customerId)?.rank ?? null, rankAfter: scenario.get(item.customerId)?.rank ?? null,
    })),
  };
}
