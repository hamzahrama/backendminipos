import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { PvReportQueryDto, ReportRangeDto } from "./reports.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  async summary(range: ReportRangeDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) {
      throw new BadRequestException("Tanggal harus berformat YYYY-MM-DD.");
    }
    const from = new Date(`${range.from}T00:00:00+07:00`);
    const to = new Date(`${range.to}T23:59:59.999+07:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestException("Rentang tanggal laporan tidak valid.");
    if (to.getTime() - from.getTime() > 93 * 24 * 60 * 60 * 1000) throw new BadRequestException("Maksimal rentang laporan 93 hari.");
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    const sales = await this.prisma.saleTransaction.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true, total: true, createdAt: true,
        items: { select: {
          quantity: true, lineTotal: true,
          product: { select: { category: { select: { id: true, name: true } } } },
        } },
      }, orderBy: { createdAt: "asc" },
    });
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, transactions: 0, revenue: 0 }));
    const categoryTotals = new Map<string, { categoryId: string | null; category: string; quantity: number; revenue: number }>();
    let revenue = 0, soldQuantity = 0;
    for (const sale of sales) {
      const amount = Number(sale.total);
      revenue += amount;
      const hourText = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(sale.createdAt);
      const hour = Number(hourText);
      hourly[hour].transactions += 1; hourly[hour].revenue += amount;
      for (const item of sale.items) {
        const quantity = Number(item.quantity);
        const itemRevenue = Number(item.lineTotal);
        soldQuantity += quantity;
        const categoryId = item.product?.category?.id ?? null;
        const category = item.product?.category?.name ?? "Lainnya";
        const current = categoryTotals.get(categoryId ?? "uncategorized") ?? { categoryId, category, quantity: 0, revenue: 0 };
        current.quantity += quantity; current.revenue += itemRevenue;
        categoryTotals.set(categoryId ?? "uncategorized", current);
      }
    }
    return {
      tenantId, from: range.from, to: range.to,
      totalRevenue: Math.round(revenue * 100) / 100,
      transactionCount: sales.length,
      averageBasketSize: sales.length ? Math.round((soldQuantity / sales.length) * 100) / 100 : 0,
      averageTransactionValue: sales.length ? Math.round((revenue / sales.length) * 100) / 100 : 0,
      hourly: hourly.map((point) => ({ ...point, revenue: Math.round(point.revenue * 100) / 100 })),
      categories: [...categoryTotals.values()].sort((a, b) => b.revenue - a.revenue),
    };
  }

  async profitLoss(range: ReportRangeDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) {
      throw new BadRequestException("Tanggal harus berformat YYYY-MM-DD.");
    }
    const from = new Date(`${range.from}T00:00:00+07:00`);
    const to = new Date(`${range.to}T23:59:59.999+07:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestException("Rentang tanggal laporan tidak valid.");
    if (to.getTime() - from.getTime() > 93 * 24 * 60 * 60 * 1000) throw new BadRequestException("Maksimal rentang laporan 93 hari.");
    const sales = await this.prisma.saleTransaction.findMany({
      where: { createdAt: { gte: from, lte: to } }, select: { invoiceNo: true, total: true },
    });
    const movements = sales.length ? await this.prisma.stockMovement.findMany({
        where: { type: "OUT", reference: { in: sales.map((sale) => sale.invoiceNo) } },
        select: { quantity: true, batch: { select: { unitCost: true } } },
      }) : [];
    const expenses = await this.prisma.expense.findMany({ where: {
        date: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) },
      }, select: { category: true, amount: true } });
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const knownMovements = movements.filter((movement) => movement.batch.unitCost !== null);
    const costOfGoods = knownMovements.reduce((sum, movement) => sum + Number(movement.quantity) * Number(movement.batch.unitCost), 0);
    const operatingExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const expenseCategories = new Map<string, number>();
    for (const expense of expenses) expenseCategories.set(expense.category, (expenseCategories.get(expense.category) ?? 0) + Number(expense.amount));
    return {
      from: range.from, to: range.to,
      revenue: Math.round(revenue * 100) / 100,
      costOfGoods: Math.round(costOfGoods * 100) / 100,
      grossProfit: Math.round((revenue - costOfGoods) * 100) / 100,
      operatingExpense: Math.round(operatingExpense * 100) / 100,
      netProfit: Math.round((revenue - costOfGoods - operatingExpense) * 100) / 100,
      missingCostMovementCount: movements.length - knownMovements.length,
      expenseCategories: [...expenseCategories.entries()].map(([category, amount]) => ({ category, amount })),
    };
  }

  async pvSummary(query: PvReportQueryDto) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)) throw new BadRequestException("Bulan harus berformat YYYY-MM.");
    const [year, month] = query.month.split("-").map(Number);
    const from = new Date(`${query.month}-01T00:00:00+07:00`);
    const to = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000 - 1);
    const logs = await this.prisma.pvLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        pv: true,
        customer: { select: { id: true, name: true, hniProfile: { select: { hniId: true } } } },
        product: { select: { sku: true, name: true } },
      }, orderBy: { createdAt: "asc" },
    });
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new NotFoundException("Konteks toko tidak ditemukan.");
    // SaleItem has no tenant column, so the tenant filter must be explicit on the parent transaction.
    const saleItems = await this.prisma.saleItem.findMany({
      where: { unitPv: { gt: 0 }, transaction: { tenantId, memberMode: true, createdAt: { gte: from, lte: to } } },
      select: {
        sku: true, productName: true, quantity: true, unitPv: true,
        transaction: { select: { memberHniId: true, customer: { select: { id: true, name: true, hniProfile: { select: { hniId: true } } } } } },
      },
    });
    const detailTotals = new Map<string, { customerId: string | null; hniId: string | null; name: string; sku: string; product: string; quantity: number; totalPv: number }>();
    for (const item of saleItems) {
      const customer = item.transaction.customer;
      const hniId = customer?.hniProfile?.hniId ?? item.transaction.memberHniId ?? null;
      const key = `${customer?.id ?? hniId ?? "unknown"}|${item.sku}`;
      const detail = detailTotals.get(key) ?? {
        customerId: customer?.id ?? null, hniId, name: customer?.name ?? "Customer dihapus", sku: item.sku, product: item.productName, quantity: 0, totalPv: 0,
      };
      detail.quantity += Number(item.quantity);
      detail.totalPv += Number(item.quantity) * Number(item.unitPv);
      detailTotals.set(key, detail);
    }
    const memberTotals = new Map<string, { customerId: string | null; name: string; hniId: string | null; totalPv: number }>();
    const productTotals = new Map<string, { sku: string; product: string; totalPv: number }>();
    for (const log of logs) {
      const pv = Number(log.pv);
      const customerId = log.customer?.id ?? null;
      const member = memberTotals.get(customerId ?? "unknown") ?? {
        customerId, name: log.customer?.name ?? "Customer dihapus", hniId: log.customer?.hniProfile?.hniId ?? null, totalPv: 0,
      };
      member.totalPv += pv; memberTotals.set(customerId ?? "unknown", member);
      const sku = log.product?.sku ?? "PRODUK-DIHAPUS";
      const product = productTotals.get(sku) ?? { sku, product: log.product?.name ?? "Produk dihapus", totalPv: 0 };
      product.totalPv += pv; productTotals.set(sku, product);
    }
    return {
      month: query.month,
      totalPv: Math.round(logs.reduce((sum, log) => sum + Number(log.pv), 0) * 100) / 100,
      members: [...memberTotals.values()].map((row) => ({ ...row, totalPv: Math.round(row.totalPv * 100) / 100 })).sort((a, b) => b.totalPv - a.totalPv),
      products: [...productTotals.values()].map((row) => ({ ...row, totalPv: Math.round(row.totalPv * 100) / 100 })).sort((a, b) => b.totalPv - a.totalPv),
      // Per member × SKU from the sale lines (quantity and PV per unit at the time of sale).
      details: [...detailTotals.values()]
        .map((row) => ({ ...row, quantity: Math.round(row.quantity * 100) / 100, totalPv: Math.round(row.totalPv * 100) / 100 }))
        .sort((a, b) => (a.hniId ?? "").localeCompare(b.hniId ?? "") || a.sku.localeCompare(b.sku)),
    };
  }
}
