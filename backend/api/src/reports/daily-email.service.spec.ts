import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { DailyReportEmailService } from "./daily-email.service";

const mail = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mail.createTransport } }));

const config = (values: Record<string, string | undefined>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;
const smtp = { SMTP_HOST: "smtp.test", SMTP_FROM: "POS <pos@test>" };

function tenant(id: string, name: string, emails: string[]) {
  return { id, name, memberships: emails.map((email) => ({ user: { email } })) };
}

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenant: { findMany: vi.fn().mockResolvedValue([tenant("tenant-1", "Toko <Sehat>", ["a@x.id", "a@x.id", "b@x.id"])]) },
    saleTransaction: { findMany: vi.fn().mockResolvedValue([{ invoiceNo: "INV-1", total: 100000 }, { invoiceNo: "INV-2", total: "50000" }]) },
    stockMovement: { findMany: vi.fn().mockResolvedValue([
      { quantity: 2, batch: { unitCost: 20000 } }, { quantity: 1, batch: { unitCost: null } },
    ]) },
    expense: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 15000 } }) },
    ...overrides,
  };
}

beforeEach(() => {
  mail.sendMail.mockReset().mockResolvedValue({});
  mail.createTransport.mockReset().mockReturnValue({ sendMail: mail.sendMail });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T00:30:00Z")); // 07:30 WIB
});

afterEach(() => vi.useRealTimers());

describe("DailyReportEmailService constructor", () => {
  it("does not create a transport without SMTP_HOST and the cron is a no-op", async () => {
    const prisma = fakePrisma();
    const service = new DailyReportEmailService(prisma as unknown as PrismaService, config({}));
    await service.sendScheduledReports();
    expect(mail.createTransport).not.toHaveBeenCalled();
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it("configures auth/secure only when provided", () => {
    new DailyReportEmailService(fakePrisma() as unknown as PrismaService, config({ SMTP_HOST: "h" }));
    expect(mail.createTransport).toHaveBeenLastCalledWith({ host: "h", port: 587, secure: false });
    new DailyReportEmailService(fakePrisma() as unknown as PrismaService, config({
      SMTP_HOST: "h", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "u", SMTP_PASSWORD: "p",
    }));
    expect(mail.createTransport).toHaveBeenLastCalledWith({ host: "h", port: 465, secure: true, auth: { user: "u", pass: "p" } });
  });
});

describe("DailyReportEmailService.sendScheduledReports", () => {
  it("sends yesterday's WIB summary to unique owners with explicit tenant filters", async () => {
    const prisma = fakePrisma();
    const service = new DailyReportEmailService(prisma as unknown as PrismaService, config(smtp));
    await service.sendScheduledReports();

    expect(prisma.tenant.findMany.mock.calls[0][0].where).toEqual({ dailyReportEnabled: true, dailyReportHour: 7 });
    expect(prisma.saleTransaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", createdAt: { gte: new Date("2026-10-05T17:00:00.000Z"), lte: new Date("2026-10-06T16:59:59.999Z") } },
      select: { invoiceNo: true, total: true },
    });
    expect(prisma.stockMovement.findMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", type: "OUT", reference: { in: ["INV-1", "INV-2"] } });
    expect(prisma.expense.aggregate.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-1", date: { gte: new Date("2026-10-06T00:00:00.000Z"), lte: new Date("2026-10-06T00:00:00.000Z") },
    });

    expect(mail.sendMail).toHaveBeenCalledOnce();
    const message = mail.sendMail.mock.calls[0][0];
    expect(message.from).toBe("POS <pos@test>");
    expect(message.to).toEqual(["a@x.id", "b@x.id"]);
    expect(message.subject).toBe("Laporan harian Toko <Sehat> — 2026-10-06");
    expect(message.text).toContain("Transaksi: 2");
    expect(message.text).toMatch(/Omset: Rp\s?150\.000/);
    expect(message.text).toMatch(/HPP tercatat: Rp\s?40\.000/);
    expect(message.text).toMatch(/Pengeluaran: Rp\s?15\.000/);
    expect(message.text).toContain("Biaya stok belum tercatat: 1 pergerakan.");
    expect(message.html).toContain("Toko &lt;Sehat&gt;");
    expect(message.html).not.toContain("<Sehat>");
  });

  it("skips movement lookup with no sales, tolerates null expense sums and uses default sender", async () => {
    const prisma = fakePrisma({
      saleTransaction: { findMany: vi.fn().mockResolvedValue([]) },
      expense: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
    });
    const service = new DailyReportEmailService(prisma as unknown as PrismaService, config({ SMTP_HOST: "h" }));
    await service.sendScheduledReports();
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    const message = mail.sendMail.mock.calls[0][0];
    expect(message.from).toBe("HNI POS <noreply@localhost>");
    expect(message.text).toContain("Transaksi: 0");
    expect(message.text).not.toContain("belum tercatat");
    expect(message.html).not.toContain("Catatan");
  });

  it("skips tenants without owner emails and keeps going after a failure", async () => {
    const prisma = fakePrisma({
      tenant: { findMany: vi.fn().mockResolvedValue([
        tenant("t-none", "Kosong", []), tenant("t-fail", "Gagal", ["f@x.id"]), tenant("t-ok", "Oke", ["o@x.id"]),
      ]) },
    });
    mail.sendMail.mockRejectedValueOnce(new Error("smtp down"));
    const service = new DailyReportEmailService(prisma as unknown as PrismaService, config(smtp));
    const logError = vi.spyOn((service as unknown as { logger: { error: () => void } }).logger, "error").mockImplementation(() => undefined);
    await service.sendScheduledReports();
    expect(prisma.saleTransaction.findMany).toHaveBeenCalledTimes(2);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(mail.sendMail.mock.calls[1][0].to).toEqual(["o@x.id"]);
    expect(logError).toHaveBeenCalledWith("Gagal mengirim laporan tenant t-fail.", expect.any(String));
  });

  it("logs non-Error failures without a stack", async () => {
    const prisma = fakePrisma({ saleTransaction: { findMany: vi.fn().mockRejectedValue("nope") } });
    const service = new DailyReportEmailService(prisma as unknown as PrismaService, config(smtp));
    const logError = vi.spyOn((service as unknown as { logger: { error: () => void } }).logger, "error").mockImplementation(() => undefined);
    await service.sendScheduledReports();
    expect(logError).toHaveBeenCalledWith("Gagal mengirim laporan tenant tenant-1.", undefined);
  });
});
