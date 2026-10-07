import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateVoucherDto } from "./vouchers.dto";

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  list() { return this.prisma.voucher.findMany({ orderBy: { createdAt: "desc" } }); }

  async create(input: CreateVoucherDto) {
    if (input.discountType === "PERCENT" && input.value > 100) throw new BadRequestException("Diskon persentase maksimal 100%.");
    if (input.startsAt && input.endsAt && new Date(input.startsAt) >= new Date(input.endsAt)) {
      throw new BadRequestException("Tanggal akhir voucher harus setelah tanggal mulai.");
    }
    const tenantId = this.requireTenantId();
    try {
      return await this.prisma.voucher.create({ data: {
        tenantId, code: input.code, discountType: input.discountType, value: input.value,
        minSubtotal: input.minSubtotal ?? 0, maxDiscount: input.maxDiscount,
        maxUses: input.maxUses, startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined, isActive: input.isActive ?? true,
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Kode voucher sudah ada di toko ini.");
      throw error;
    }
  }

  async deactivate(id: string) {
    const result = await this.prisma.voucher.updateMany({ where: { id }, data: { isActive: false } });
    if (!result.count) throw new NotFoundException("Voucher tidak ditemukan.");
    return { deactivated: true };
  }

  async preview(code: string, subtotal: number) {
    const voucher = await this.findAvailable(code);
    if (subtotal < Number(voucher.minSubtotal)) throw new BadRequestException(`Minimal belanja voucher ini Rp ${Number(voucher.minSubtotal).toLocaleString("id-ID")}.`);
    return { code: voucher.code, discountAmount: this.discountFor(voucher, subtotal), subtotal };
  }

  async findAvailable(code: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const voucher = await client.voucher.findUnique({ where: { tenantId_code: { tenantId: this.requireTenantId(), code: code.trim().toUpperCase() } } });
    const now = new Date();
    if (!voucher || !voucher.isActive || (voucher.startsAt && voucher.startsAt > now) || (voucher.endsAt && voucher.endsAt < now)) {
      throw new NotFoundException("Voucher tidak aktif atau tidak ditemukan.");
    }
    if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) throw new ConflictException("Kuota voucher sudah habis.");
    return voucher;
  }

  discountFor(voucher: { discountType: string; value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null }, subtotal: number) {
    const raw = voucher.discountType === "PERCENT" ? subtotal * Number(voucher.value) / 100 : Number(voucher.value);
    const rounded = Math.round(raw * 100) / 100;
    return Math.min(rounded, voucher.maxDiscount === null ? rounded : Number(voucher.maxDiscount), subtotal);
  }

  private requireTenantId() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return tenantId;
  }
}
