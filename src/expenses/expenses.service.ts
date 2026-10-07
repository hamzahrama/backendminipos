import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateExpenseDto } from "./expenses.dto";

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  list(from?: string, to?: string) {
    const where = from && to ? {
      date: { gte: new Date(`${from.slice(0, 10)}T00:00:00.000Z`), lte: new Date(`${to.slice(0, 10)}T00:00:00.000Z`) },
    } : {};
    return this.prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }

  create(input: CreateExpenseDto, createdBy: string) {
    const tenantId = this.requireTenantId();
    return this.prisma.expense.create({ data: {
      tenantId, date: new Date(`${input.date.slice(0, 10)}T00:00:00.000Z`),
      category: input.category.trim(), description: input.description?.trim(), amount: input.amount, createdBy,
    } });
  }

  async remove(id: string) {
    const deleted = await this.prisma.expense.deleteMany({ where: { id } });
    if (!deleted.count) throw new NotFoundException("Pengeluaran tidak ditemukan.");
    return { deleted: true };
  }

  private requireTenantId() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return tenantId;
  }
}
