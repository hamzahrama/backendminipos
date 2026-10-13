import { describe, expect, it } from "vitest";
import { AlertNotifier, ErrorReporter, MidtransService, readMidtransConfig } from "./external.service";

describe("external integrations (mock/sandbox)", () => {
  it("midtrans mock charge works without credentials", async () => {
    const svc = new MidtransService({ isProduction: false });
    expect(svc.mockMode).toBe(true);
    const res = await svc.charge({ orderId: "SUB-1", grossAmount: 50000 });
    expect(res).toMatchObject({ ok: true, mock: true });
    expect(res.redirectUrl).toContain("sandbox.midtrans.com");
  });
  it("midtrans rejects non-positive amounts", async () => {
    const svc = new MidtransService({ isProduction: false });
    expect((await svc.charge({ orderId: "X", grossAmount: 0 })).ok).toBe(false);
  });
  it("readMidtransConfig detects production flag", () => {
    expect(readMidtransConfig({ MIDTRANS_SERVER_KEY: "k", MIDTRANS_IS_PRODUCTION: "true" }).isProduction).toBe(true);
  });
  it("notifier reports mock when unconfigured", async () => {
    const results = await new AlertNotifier({}).send("test alert");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.mock && !r.delivered)).toBe(true);
  });
  it("error reporter captures in-memory without DSN", () => {
    const reporter = new ErrorReporter("");
    expect(reporter.enabled).toBe(false);
    reporter.capture("boom", { where: "test" });
    expect(reporter.captured).toHaveLength(1);
  });
});
