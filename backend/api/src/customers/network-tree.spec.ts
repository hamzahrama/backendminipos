import { describe, expect, it } from "vitest";
import { buildNetworkTree, computeNetworkLinks } from "./network-tree";

const m = (customerId: string, hniId: string, uplineHniId: string | null = null) => ({ customerId, hniId, uplineHniId });

describe("computeNetworkLinks", () => {
  it("resolves uplines case-insensitively and computes depth", () => {
    const links = computeNetworkLinks([m("a", "H1"), m("b", "H2", "h1"), m("c", "H3", "H2")]);
    expect(links).toEqual([
      { customerId: "a", parentCustomerId: null, depth: 0, externalUplineHniId: null },
      { customerId: "b", parentCustomerId: "a", depth: 1, externalUplineHniId: null },
      { customerId: "c", parentCustomerId: "b", depth: 2, externalUplineHniId: null },
    ]);
  });

  it("keeps unknown uplines as external roots and ignores self-references", () => {
    const links = computeNetworkLinks([m("a", "H1", "OUTSIDE"), m("b", "H2", "H2")]);
    expect(links[0]).toMatchObject({ parentCustomerId: null, externalUplineHniId: "OUTSIDE" });
    expect(links[1]).toMatchObject({ parentCustomerId: null, externalUplineHniId: null });
  });

  it("breaks cycles by making the smallest HNI ID in the cycle a root", () => {
    const links = computeNetworkLinks([m("a", "H1", "H3"), m("b", "H2", "H1"), m("c", "H3", "H2"), m("d", "H4", "H3")]);
    const byId = Object.fromEntries(links.map((link) => [link.customerId, link]));
    expect(byId.a).toMatchObject({ parentCustomerId: null, depth: 0 });
    expect(byId.b).toMatchObject({ parentCustomerId: "a", depth: 1 });
    expect(byId.c).toMatchObject({ parentCustomerId: "b", depth: 2 });
    expect(byId.d).toMatchObject({ parentCustomerId: "c", depth: 3 });
  });
});

describe("buildNetworkTree", () => {
  const chain = Array.from({ length: 7 }, (_, index) => ({
    customerId: `c${index}`, parentCustomerId: index ? `c${index - 1}` : null, name: `Member ${index}`, hniId: `H${index}`,
  }));

  it("sums group PV across all levels and hides levels beyond the display limit", () => {
    const pv = new Map(chain.map((node) => [node.customerId, 10]));
    const [root] = buildNetworkTree(chain, pv, 5);
    expect(root.groupPv).toBe(70);
    expect(root.downlineCount).toBe(6);
    let node = root;
    for (let level = 1; level < 5; level += 1) node = node.downlines[0];
    expect(node.level).toBe(4);
    expect(node.downlines).toEqual([]);
    expect(node.hiddenDownlineCount).toBe(2);
    expect(node.groupPv).toBe(30);
  });

  it("sorts roots by group PV and treats missing parents as roots", () => {
    const roots = buildNetworkTree([
      { customerId: "x", parentCustomerId: "gone", name: "X", hniId: "HX" },
      { customerId: "y", parentCustomerId: null, name: "Y", hniId: "HY" },
    ], new Map([["y", 5], ["x", 1]]));
    expect(roots.map((root) => root.id)).toEqual(["y", "x"]);
  });
});
