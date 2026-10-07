import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import nodemailer, { Transporter } from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

@Injectable()
export class DailyReportEmailService {
  private readonly logger = new Logger(DailyReportEmailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const host = config.get<string>("SMTP_HOST");
    this.from = config.get<string>("SMTP_FROM") || "HNI POS <noreply@localhost>";
    const port = Number(config.get<string>("SMTP_PORT") ?? 587);
    const user = config.get<string>("SMTP_USER");
    const pass = config.get<string>("SMTP_PASSWORD");
    this.transport = host ? nodemailer.createTransport({ host, port, secure: config.get<string>("SMTP_SECURE") === "true", ...(user && pass ? { auth: { user, pass } } : {}) }) : null;
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: "Asia/Jakarta" })
  async sendScheduledReports() {
    if (!this.transport) return;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const tenants = await this.prisma.tenant.findMany({
      where: { dailyReportEnabled: true, dailyReportHour: hour },
      select: { id: true, name: true, memberships: { where: { role: { code: "owner" } }, select: { user: { select: { email: true } } } } },
    });
    for (const tenant of tenants) {
      const recipients = [...new Set(tenant.memberships.map(({ user }) => user.email))];
      if (!recipients.length) continue;
      try {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const from = new Date(`${day}T00:00:00+07:00`);
        const to = new Date(`${day}T23:59:59.999+07:00`);
        const sales = await this.prisma.saleTransaction.findMany({ where: { tenantId: tenant.id, createdAt: { gte: from, lte: to } }, select: { invoiceNo: true, total: true } });
        const movements = sales.length ? await this.prisma.stockMovement.findMany({
          where: { tenantId: tenant.id, type: "OUT", reference: { in: sales.map(({ invoiceNo }) => invoiceNo) } },
          select: { quantity: true, batch: { select: { unitCost: true } } },
        }) : [];
        const expenseDate = new Date(`${day}T00:00:00.000Z`);
        const expenses = await this.prisma.expense.aggregate({ where: { tenantId: tenant.id, date: { gte: expenseDate, lte: expenseDate } }, _sum: { amount: true } });
        const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
        const cost = movements.filter((row) => row.batch.unitCost !== null).reduce((sum, row) => sum + Number(row.quantity) * Number(row.batch.unitCost), 0);
        const opex = Number(expenses._sum.amount ?? 0);
        const missingCosts = movements.filter((row) => row.batch.unitCost === null).length;
        const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
        const safeName = escapeHtml(tenant.name);
        await this.transport.sendMail({
          from: this.from, to: recipients, subject: `Laporan harian ${tenant.name} — ${day}`,
          text: `Ringkasan ${tenant.name} tanggal ${day}. Transaksi: ${sales.length}. Omset: ${money(revenue)}. HPP tercatat: ${money(cost)}. Pengeluaran: ${money(opex)}.${missingCosts ? ` Biaya stok belum tercatat: ${missingCosts} pergerakan.` : ""}`,
          html: `<main style="font:16px Arial,sans-serif;color:#0f172a"><h1>Laporan harian ${safeName}</h1><p>${day} (WIB)</p><ul><li>Transaksi: ${sales.length}</li><li>Omset: ${money(revenue)}</li><li>HPP tercatat: ${money(cost)}</li><li>Pengeluaran: ${money(opex)}</li></ul>${missingCosts ? `<p>Catatan: biaya stok belum tercatat pada ${missingCosts} pergerakan.</p>` : ""}</main>`,
        });
      } catch (error) {
        this.logger.error(`Gagal mengirim laporan tenant ${tenant.id}.`, error instanceof Error ? error.stack : undefined);
      }
    }
  }
}
