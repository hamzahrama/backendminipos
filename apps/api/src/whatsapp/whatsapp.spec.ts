import { BadGatewayException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { normalizeWhatsAppNumber, readWhatsAppConfig, WhatsAppGateway } from "./whatsapp.gateway";
import { WhatsAppService } from "./whatsapp.service";
import { buildReceiptMessage } from "./whatsapp.templates";

describe("normalizeWhatsAppNumber", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["6281234567890", "6281234567890"],
  ])("normalizes %s", (input, expected) => expect(normalizeWhatsAppNumber(input)).toBe(expected));

  it.each(["", "12345", "021-555-1234", "abc", "0812"])("rejects %s", (input) => expect(normalizeWhatsAppNumber(input)).toBeNull());
});

describe("readWhatsAppConfig", () => {
  it("stays disabled without a token", () => {
    expect(readWhatsAppConfig({ WHATSAPP_PROVIDER: "fonnte" }).provider).toBe("disabled");
    expect(readWhatsAppConfig({ WHATSAPP_PROVIDER: "fonnte", WHATSAPP_TOKEN: "abc" }).provider).toBe("fonnte");
    expect(readWhatsAppConfig({ WHATSAPP_PROVIDER: "unknown", WHATSAPP_TOKEN: "abc" }).provider).toBe("disabled");
  });
});

describe("buildReceiptMessage", () => {
  it("contains invoice, items, total, PV and receipt link", () => {
    const text = buildReceiptMessage({
      storeName: "Toko Sehat", invoiceNo: "HNI-20261007-000001", createdAt: new Date("2026-10-07T03:00:00Z"),
      customerName: "Bu Ani", items: [{ productName: "Madu Habbatussauda", quantity: 2, lineTotal: 100000 }],
      discount: 5000, total: 95000, totalPv: 12, receiptUrl: "https://pos.test/receipt/abc",
    });
    expect(text).toContain("HNI-20261007-000001");
    expect(text).toContain("Madu Habbatussauda x2");
    expect(text).toContain("Total: Rp95.000");
    expect(text).toContain("PV: 12");
    expect(text).toContain("https://pos.test/receipt/abc");
  });
});

describe("WhatsAppGateway", () => {
  it("sends through Fonnte with the token header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, id: ["msg-1"] }), { status: 200 }));
    const gateway = new WhatsAppGateway({ provider: "fonnte", token: "tok", timeoutMs: 5000 }, fetcher);
    const result = await gateway.send("6281234567890", "halo");
    expect(result).toMatchObject({ ok: true, providerMessageId: "msg-1" });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.fonnte.com/send");
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Authorization: "tok" });
  });

  it("reports provider rejection", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: false, reason: "invalid token" }), { status: 200 }));
    const gateway = new WhatsAppGateway({ provider: "fonnte", token: "tok", timeoutMs: 5000 }, fetcher);
    expect(await gateway.send("6281234567890", "halo")).toMatchObject({ ok: false, error: "invalid token" });
  });

  it("requires a Wablas base URL", async () => {
    const gateway = new WhatsAppGateway({ provider: "wablas", token: "tok", timeoutMs: 5000 }, vi.fn());
    expect(await gateway.send("6281234567890", "halo")).toMatchObject({ ok: false });
  });
});

function makeService(gateway: WhatsAppGateway, sale: Record<string, unknown> | null = {
  id: "trx-1", invoiceNo: "HNI-1", receiptToken: "token", createdAt: new Date(), discount: 0, total: 10000, totalPv: 0,
  tenant: { name: "Toko" }, customer: { name: "Ani", phone: "08123456789" }, items: [{ productName: "A", quantity: 1, lineTotal: 10000 }],
}) {
  const prisma = {
    saleTransaction: { findFirst: vi.fn().mockResolvedValue(sale) },
    whatsAppLog: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "log-1", ...data })) },
  };
  const context = new TenantContextService();
  const service = new WhatsAppService(prisma as unknown as PrismaService, context, gateway);
  return { prisma, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn), service };
}

describe("WhatsAppService.sendReceipt", () => {
  it("logs a successful send using the customer phone", async () => {
    const gateway = { provider: "fonnte", enabled: true, send: vi.fn().mockResolvedValue({ ok: true, provider: "fonnte", providerMessageId: "m1", durationMs: 120 }) } as unknown as WhatsAppGateway;
    const { prisma, run, service } = makeService(gateway);
    const log = await run(() => service.sendReceipt("trx-1", undefined, "user-1"));
    expect(log).toMatchObject({ status: "SENT", phone: "628123456789" });
    expect(prisma.whatsAppLog.create.mock.calls[0][0].data.tenantId).toBe("tenant-1");
  });

  it("logs SKIPPED and returns 503 when the gateway is disabled", async () => {
    const { prisma, run, service } = makeService(new WhatsAppGateway({ provider: "disabled", timeoutMs: 5000 }, vi.fn()));
    await expect(run(() => service.sendReceipt("trx-1", undefined, "user-1"))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.whatsAppLog.create.mock.calls[0][0].data.status).toBe("SKIPPED");
  });

  it("logs FAILED and returns 502 on provider error", async () => {
    const gateway = { provider: "fonnte", enabled: true, send: vi.fn().mockResolvedValue({ ok: false, provider: "fonnte", error: "down", durationMs: 50 }) } as unknown as WhatsAppGateway;
    const { prisma, run, service } = makeService(gateway);
    await expect(run(() => service.sendReceipt("trx-1", "081299998888", "user-1"))).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.whatsAppLog.create.mock.calls[0][0].data).toMatchObject({ status: "FAILED", phone: "6281299998888" });
  });

  it("rejects invalid phone numbers before calling the gateway", async () => {
    const gateway = { provider: "fonnte", enabled: true, send: vi.fn() } as unknown as WhatsAppGateway;
    const { run, service } = makeService(gateway);
    await expect(run(() => service.sendReceipt("trx-1", "123", "user-1"))).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.send).not.toHaveBeenCalled();
  });
});
