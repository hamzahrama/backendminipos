import { describe, expect, it } from "vitest";
import { buildSubscriptionInvoice, canUseFeature, planFor, PLANS, reminderDates } from "./plans";

describe("billing plans (Day 25)", () => {
  it("defines Free/Pro/Enterprise tiers", () => {
    expect(Object.keys(PLANS)).toEqual(["FREE", "PRO", "ENTERPRISE"]);
    expect(PLANS.FREE.maxProducts).toBe(100);
    expect(PLANS.PRO.priceRp).toBe(99000);
  });
  it("gates whatsapp/catalog/bonus features per plan", () => {
    expect(canUseFeature(planFor("FREE"), "whatsapp")).toBe(false);
    expect(canUseFeature(planFor("PRO"), "whatsapp")).toBe(true);
    expect(canUseFeature(planFor("FREE"), "reports")).toBe(true);
  });
  it("falls back to FREE for unknown codes", () => {
    expect(planFor("GOLD").code).toBe("FREE");
  });
  it("builds sequential invoice numbers", () => {
    expect(buildSubscriptionInvoice("toko-ibu", "202610", 7)).toBe("INV/toko-ibu/202610/0007");
  });
  it("schedules 3 reminders around due date", () => {
    const due = new Date("2026-11-01T00:00:00Z");
    expect(reminderDates(due)).toHaveLength(3);
  });
});
