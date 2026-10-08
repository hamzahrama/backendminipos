import {
  BadGatewayException, BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { normalizeWhatsAppNumber, WhatsAppGateway } from "./whatsapp.gateway";
import { buildReceiptMessage, RECEIPT_TEMPLATE_CODE } from "./whatsapp.templates";

const MAX_SENDS_PER_TRANSACTION = 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly gateway: WhatsAppGateway,
  ) {}

  status() {
    return { provider: this.gateway.provider, enabled: this.gateway.enabled, template: RECEIPT_TEMPLATE_CODE };
  }

  async sendReceipt(transactionId: string, phoneOverride: string | undefined, userId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    const sale = await this.prisma.saleTransaction.findFirst({
      where: { id: transactionId, tenantId },
      select: {
        id: true, invoiceNo: true, receiptToken: true, createdAt: true, discount: true, total: true, totalPv: true,
        tenant: { select: { name: true } }, customer: { select: { name: true, phone: true } },
        items: { select: { productName: true, quantity: true, lineTotal: true } },
      },
    });
    if (!sale) throw new NotFoundException("Transaksi tidak ditemukan.");

    const rawPhone = phoneOverride?.trim() || sale.customer?.phone;
    if (!rawPhone) throw new BadRequestException("Nomor WhatsApp pelanggan belum diisi.");
    const phone = normalizeWhatsAppNumber(rawPhone);
    if (!phone) throw new BadRequestException("Nomor WhatsApp tidak valid. Gunakan format 08xx atau 628xx.");

    const recent = await this.prisma.whatsAppLog.count({
      where: { transactionId: sale.id, status: { in: ["SENT", "FAILED"] }, createdAt: { gte: new Date(Date.now() - SEND_WINDOW_MS) } },
    });
    if (recent >= MAX_SENDS_PER_TRANSACTION) {
      throw new HttpException("Struk ini sudah dikirim beberapa kali. Coba lagi 10 menit lagi.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const siteUrl = (process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const message = buildReceiptMessage({
      storeName: sale.tenant.name, invoiceNo: sale.invoiceNo, createdAt: sale.createdAt,
      customerName: sale.customer?.name,
      items: sale.items.map((item) => ({ productName: item.productName, quantity: Number(item.quantity), lineTotal: Number(item.lineTotal) })),
      discount: Number(sale.discount), total: Number(sale.total), totalPv: Number(sale.totalPv),
      receiptUrl: `${siteUrl}/receipt/${sale.receiptToken}`,
    });
    const result = await this.gateway.send(phone, message);
    const log = await this.prisma.whatsAppLog.create({
      data: {
        tenantId, transactionId: sale.id, phone, template: RECEIPT_TEMPLATE_CODE, provider: result.provider,
        status: result.ok ? "SENT" : result.provider === "disabled" ? "SKIPPED" : "FAILED",
        providerMessageId: result.ok ? result.providerMessageId : null,
        error: result.ok ? null : result.error, durationMs: result.durationMs, createdBy: userId,
      },
      select: { id: true, status: true, phone: true, provider: true, durationMs: true, createdAt: true },
    });
    if (!result.ok) {
      if (result.provider === "disabled") throw new ServiceUnavailableException(result.error);
      throw new BadGatewayException(`Struk gagal dikirim: ${result.error}`);
    }
    return log;
  }

  logs(limit = 50) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return this.prisma.whatsAppLog.findMany({
      where: { tenantId },
      take: Math.max(1, Math.min(limit, 200)), orderBy: { createdAt: "desc" },
      select: {
        id: true, phone: true, template: true, provider: true, status: true, error: true, durationMs: true, createdAt: true,
        transaction: { select: { invoiceNo: true } },
      },
    });
  }
}
