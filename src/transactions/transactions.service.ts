import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateTransactionDto } from "../customers/customers.dto";
import { VouchersService } from "../vouchers/vouchers.service";

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly tenantContext: TenantContextService,
    private readonly vouchers: VouchersService,
  ) {}

  async checkout(input: CreateTransactionDto, idempotencyKey: string, cashierId: string) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BadRequestException("Header Idempotency-Key wajib berisi 8–128 karakter.");
    }
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.saleTransaction.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }, include: { items: true },
    });
    if (existing) return existing;
    if (input.memberMode && !input.memberHniId) throw new BadRequestException("ID HNI diperlukan untuk transaksi member.");
    if (input.memberMode && !/^[a-z0-9-]{4,32}$/i.test(input.memberHniId!.trim())) throw new BadRequestException("ID HNI harus berisi 4–32 karakter alfanumerik atau tanda hubung.");
    if (!input.memberMode && input.memberHniId) throw new BadRequestException("Pilih mode member untuk menggunakan ID HNI.");

    const merged = new Map(input.items.map((item) => [item.productId, item]));
    if (merged.size !== input.items.length) throw new BadRequestException("Produk yang sama tidak boleh dikirim lebih dari satu baris.");

    try {
      return await this.prisma.$transaction(async (tx) => {
        let customerId = input.customerId;
        if (input.memberMode) {
          const profile = await tx.customerHniProfile.findFirst({
            where: { hniId: input.memberHniId!.trim() }, select: { customerId: true },
          });
          if (!profile) throw new NotFoundException("ID HNI tidak terdaftar di data customer toko ini.");
          if (customerId && customerId !== profile.customerId) throw new BadRequestException("ID HNI tidak cocok dengan customer yang dipilih.");
          customerId = profile.customerId;
        } else if (customerId) {
          const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
          if (!customer) throw new NotFoundException("Customer tidak ditemukan.");
        }

        const items: Array<{
          productId: string; productName: string; sku: string; quantity: number;
          unitPrice: number; unitPv: number; lineTotal: number; discountAmount: number; pv: number;
        }> = [];
        let subtotal = 0;
        let itemDiscountTotal = 0;
        let eligibleSubtotal = 0;
        let totalPv = 0;
        for (const [productId, inputItem] of merged) {
          const quantity = inputItem.quantity;
          const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null, isActive: true } });
          if (!product) throw new NotFoundException("Produk tidak ditemukan atau sedang dinonaktifkan.");
          const unitPrice = Number(input.memberMode ? product.memberPrice : product.retailPrice);
          const unitPv = input.memberMode ? Number(product.pv) : 0;
          const grossTotal = roundMoney(unitPrice * quantity);
          const discountAmount = roundMoney(inputItem.discountAmount ?? 0);
          if (discountAmount > grossTotal) throw new BadRequestException(`Diskon untuk ${product.name} melebihi nilai barang.`);
          const lineTotal = roundMoney(grossTotal - discountAmount);
          const linePv = roundMoney(unitPv * quantity);
          subtotal = roundMoney(subtotal + grossTotal);
          itemDiscountTotal = roundMoney(itemDiscountTotal + discountAmount);
          eligibleSubtotal = roundMoney(eligibleSubtotal + lineTotal);
          totalPv = roundMoney(totalPv + linePv);
          items.push({ productId, productName: product.name, sku: product.sku, quantity, unitPrice, unitPv, lineTotal, discountAmount, pv: linePv });
        }
        const orderDiscount = roundMoney(input.discountAmount ?? 0);
        if (orderDiscount > eligibleSubtotal) throw new BadRequestException("Diskon transaksi melebihi subtotal setelah diskon item.");
        let voucherDiscount = 0;
        const voucherCode = input.voucherCode?.trim().toUpperCase();
        if (voucherCode) {
          const voucher = await this.vouchers.findAvailable(voucherCode, tx);
          if (eligibleSubtotal < Number(voucher.minSubtotal)) throw new BadRequestException("Subtotal belum memenuhi minimum voucher.");
          voucherDiscount = this.vouchers.discountFor(voucher, eligibleSubtotal - orderDiscount);
          const usage = await tx.voucher.updateMany({
            where: { id: voucher.id, isActive: true, ...(voucher.maxUses !== null ? { usedCount: { lt: voucher.maxUses } } : {}) },
            data: { usedCount: { increment: 1 } },
          });
          if (usage.count !== 1) throw new ConflictException("Kuota voucher baru saja habis. Hapus voucher atau coba lagi.");
        }
        const discountTotal = roundMoney(itemDiscountTotal + orderDiscount + voucherDiscount);
        const total = roundMoney(subtotal - discountTotal);
        if (input.cashReceived < total) throw new BadRequestException("Uang diterima kurang dari total belanja.");

        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
        }).formatToParts(now);
        const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "00";
        const dateText = `${part("year")}${part("month")}${part("day")}`;
        const counterDate = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
        const counter = await tx.invoiceCounter.upsert({
          where: { tenantId_date: { tenantId, date: counterDate } },
          create: { tenantId, date: counterDate, nextValue: 1 },
          update: { nextValue: { increment: 1 } },
        });
        const invoiceNo = `HNI-${dateText}-${String(counter.nextValue).padStart(6, "0")}`;
        const transaction = await tx.saleTransaction.create({ data: {
          tenantId, customerId, invoiceNo, idempotencyKey,
          receiptToken: randomBytes(32).toString("base64url"),
          memberMode: input.memberMode, memberHniId: input.memberMode ? input.memberHniId!.trim() : null,
          subtotal, discount: discountTotal, voucherCode, total, cashReceived: input.cashReceived,
          changeAmount: roundMoney(input.cashReceived - total), totalPv,
          items: { create: items.map(({ productId, productName, sku, quantity, unitPrice, unitPv, lineTotal, discountAmount }) => ({
            productId, productName, sku, quantity, unitPrice, unitPv, lineTotal, discountAmount,
          })) },
        } });

        for (const item of items) {
          await this.inventory.consumeByFefo(tx, item.productId, item.quantity, { reference: invoiceNo, userId: cashierId });
          if (item.pv > 0) await tx.pvLog.create({ data: {
            tenantId, transactionId: transaction.id, customerId, productId: item.productId, pv: item.pv,
          } });
        }
        const reviewThreshold = Number(process.env.FRAUD_DISCOUNT_RATE_THRESHOLD ?? 0.7);
        if (subtotal > 0 && reviewThreshold > 0 && reviewThreshold <= 1 && discountTotal / subtotal >= reviewThreshold) {
          await tx.auditLog.create({ data: {
            tenantId, userId: cashierId, action: "REVIEW_HIGH_DISCOUNT", resource: invoiceNo,
          } });
        }
        return tx.saleTransaction.findUniqueOrThrow({ where: { id: transaction.id }, include: { items: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.saleTransaction.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }, include: { items: true },
        });
        if (duplicate) return duplicate;
        throw new ConflictException("Nomor invoice mengalami konflik. Ulangi transaksi dengan kunci baru.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ConflictException("Stok atau nomor invoice berubah bersamaan. Ulangi transaksi.");
      }
      throw error;
    }
  }

  async publicReceipt(token: string) {
    if (!/^[a-zA-Z0-9_-]{32,64}$/.test(token)) throw new NotFoundException("Struk tidak ditemukan.");
    const sale = await this.prisma.saleTransaction.findUnique({
      where: { receiptToken: token },
      select: {
        invoiceNo: true, memberMode: true, subtotal: true, discount: true, total: true,
        cashReceived: true, changeAmount: true, totalPv: true, createdAt: true, receiptToken: true,
        tenant: { select: { name: true, slug: true } }, customer: { select: { name: true, phone: true } },
        items: { select: { productName: true, sku: true, quantity: true, unitPrice: true, unitPv: true, lineTotal: true } },
      },
    });
    if (!sale) throw new NotFoundException("Struk tidak ditemukan.");
    return sale;
  }

  private requireTenantId() {
    const id = this.tenantContext.getTenantId();
    if (!id) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return id;
  }
}
