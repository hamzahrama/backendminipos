import { describe, expect, it } from "vitest";
import { buildOfflineSnapshot, validateQueuedTransaction } from "./offline";

describe("offline snapshot (Day 28)", () => {
  it("builds a cacheable snapshot", () => {
    const snap = buildOfflineSnapshot([
      { id: "1", sku: "A", name: "Madu", memberPrice: 50000, retailPrice: 60000, pv: 5, stock: 10 },
    ]);
    expect(snap).toMatchObject({ version: 1, count: 1 });
    expect(snap.products[0].sku).toBe("A");
  });
  it("validates queued transactions", () => {
    expect(validateQueuedTransaction([])).toContain("Keranjang kosong.");
    expect(validateQueuedTransaction([{ productId: "1", quantity: 2 }])).toEqual([]);
    expect(validateQueuedTransaction([{ productId: "1", quantity: 0 }]).length).toBeGreaterThan(0);
  });
});
