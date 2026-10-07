export type NetworkMemberInput = { customerId: string; hniId: string; uplineHniId: string | null };
export type NetworkLink = { customerId: string; parentCustomerId: string | null; depth: number; externalUplineHniId: string | null };

export type NetworkMemberNode = {
  id: string; hniId: string; name: string; level: number;
  ownPv: number; groupPv: number; downlineCount: number;
  /** Downlines beyond the display depth limit (still included in groupPv). */
  hiddenDownlineCount: number;
  downlines: NetworkMemberNode[];
};

export const MAX_NETWORK_DISPLAY_DEPTH = 5;
const round = (value: number) => Math.round(value * 100) / 100;

/** Resolves upline HNI IDs to customer IDs, breaks cycles deterministically, and computes depth. */
export function computeNetworkLinks(members: NetworkMemberInput[]): NetworkLink[] {
  const sorted = [...members].sort((a, b) => a.hniId.localeCompare(b.hniId));
  const byHni = new Map(sorted.map((member) => [member.hniId.toLowerCase(), member]));
  const parent = new Map<string, string | null>();
  const external = new Map<string, string | null>();
  for (const member of sorted) {
    const upline = member.uplineHniId?.trim();
    const match = upline ? byHni.get(upline.toLowerCase()) : undefined;
    parent.set(member.customerId, match && match.customerId !== member.customerId ? match.customerId : null);
    external.set(member.customerId, upline && !match ? upline : null);
  }

  // Break cycles: the member with the smallest HNI ID in each cycle becomes a root.
  const hniOf = new Map(sorted.map((member) => [member.customerId, member.hniId]));
  for (const member of sorted) {
    const seen: string[] = [];
    let current: string | null = member.customerId;
    while (current && !seen.includes(current)) { seen.push(current); current = parent.get(current) ?? null; }
    if (current) {
      const cycle = seen.slice(seen.indexOf(current));
      const cut = cycle.sort((a, b) => hniOf.get(a)!.localeCompare(hniOf.get(b)!))[0];
      parent.set(cut, null);
    }
  }

  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const up = parent.get(id);
    const value = up ? depthOf(up) + 1 : 0;
    depth.set(id, value);
    return value;
  };
  return sorted.map((member) => ({
    customerId: member.customerId,
    parentCustomerId: parent.get(member.customerId) ?? null,
    depth: depthOf(member.customerId),
    externalUplineHniId: external.get(member.customerId) ?? null,
  }));
}

/** Builds the display tree with own PV, group PV (all depths) and a display depth limit. */
export function buildNetworkTree(
  nodes: Array<{ customerId: string; parentCustomerId: string | null; name: string; hniId: string }>,
  pvByCustomer: Map<string, number>,
  maxDisplayDepth = MAX_NETWORK_DISPLAY_DEPTH,
) {
  const children = new Map<string | null, typeof nodes>();
  const ids = new Set(nodes.map((node) => node.customerId));
  for (const node of nodes) {
    const key = node.parentCustomerId && ids.has(node.parentCustomerId) ? node.parentCustomerId : null;
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const visited = new Set<string>();
  const build = (node: (typeof nodes)[number], level: number): NetworkMemberNode => {
    visited.add(node.customerId);
    const kids = (children.get(node.customerId) ?? []).filter((child) => !visited.has(child.customerId)).map((child) => build(child, level + 1));
    const ownPv = round(pvByCustomer.get(node.customerId) ?? 0);
    const downlineCount = kids.reduce((sum, kid) => sum + 1 + kid.downlineCount, 0);
    const result: NetworkMemberNode = {
      id: node.customerId, hniId: node.hniId, name: node.name, level, ownPv,
      groupPv: round(ownPv + kids.reduce((sum, kid) => sum + kid.groupPv, 0)),
      downlineCount, hiddenDownlineCount: 0, downlines: kids,
    };
    if (level >= maxDisplayDepth - 1 && kids.length) {
      result.hiddenDownlineCount = downlineCount;
      result.downlines = [];
    }
    return result;
  };
  const roots = (children.get(null) ?? []).map((node) => build(node, 0));
  // Any node not reached (should not happen after cycle breaking) is shown as its own root.
  for (const node of nodes) if (!visited.has(node.customerId)) roots.push(build(node, 0));
  return roots.sort((a, b) => b.groupPv - a.groupPv || a.name.localeCompare(b.name));
}
