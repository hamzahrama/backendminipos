import { describe, expect, it } from "vitest";
import { EXAMPLE_BONUS_SCHEME } from "./bonus-engine";
import { calculateHpaiPayout, validateHpaiScheme } from "./hpai-formula";

describe("hpai-formula helper", () => {
  it("flags the example scheme as not-official", () => {
    expect(validateHpaiScheme(EXAMPLE_BONUS_SCHEME)).toContain(
      "Skema masih contoh — ganti dengan marketing plan resmi HPAI.",
    );
  });
  it("accepts a valid official scheme", () => {
    expect(validateHpaiScheme({ ...EXAMPLE_BONUS_SCHEME, isExample: false })).toEqual([]);
  });
  it("computes payout math deterministically", () => {
    const payout = calculateHpaiPayout(
      { ownPv: 100, groupPv: 1000, generationPv: [200, 100], pvValueRp: 1000 },
      0.1, [0.05, 0.03],
    );
    expect(payout).toEqual({ personalBonusRp: 10000, generationBonusRp: [10000, 3000], totalBonusRp: 23000 });
  });
  it("rejects out-of-range rates", () => {
    const bad = { ...EXAMPLE_BONUS_SCHEME, isExample: false, ranks: [{ ...EXAMPLE_BONUS_SCHEME.ranks[0], personalRate: 2 }] };
    expect(validateHpaiScheme(bad).length).toBeGreaterThan(0);
  });
});
