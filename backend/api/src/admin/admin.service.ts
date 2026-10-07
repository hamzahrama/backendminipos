import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AdminTenantQueryDto, TenantStatus, UpdateTenantStatusDto } from "./admin.dto";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rough per-row storage estimate used only for usage comparison between tenants. */
const AVG_ROW_BYTES = 512;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auth: AuthService,
  ) {}

  /** Platform queries must run outside the requesting user's tenant scope. */
  private unscoped<T>(callback: () => Promise<T>): Promise<T> {
    return this.tenantContext.runUnscoped(callback);
  }

  summary() {
    return this.unscoped(async () => {
      const since = new Date(Date.now() - 30 * DAY_MS);
      const [tenants, suspended, users, transactions30d, revenue30d] = await Promise.all([
        this.prisma.tenant.count(), this.prisma.tenant.count({ where: { status: "SUSPENDED" } }), this.prisma.user.count(),
        this.prisma.saleTransaction.count({ where: { createdAt: { gte: since } } }),
        this.prisma.saleTransaction.aggregate({ where: { createdAt: { gte: since } }, _sum: { total: true } }),
      ]);
      return { tenants, activeTenants: tenants - suspended, suspendedTenants: suspended, users, transactions30d, revenue30d: Number(revenue30d._sum.total ?? 0) };
    });
  }

  listTenants(query: AdminTenantQueryDto) {
    return this.unscoped(async () => {
      const since = new Date(Date.now() - 30 * DAY_MS);
      const search = query.search?.trim();
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: { createdAt: "desc" }, take: 200,
        select: {
          id: true, name: true, slug: true, status: true, suspendedAt: true, suspendReason: true, createdAt: true, publicCatalogEnabled: true,
          _count: { select: { memberships: true, products: true, customers: true, transactions: true, productImages: true, stockMovements: true, auditLogs: true } },
        },
      });
      const ids = tenants.map((tenant) => tenant.id);
      const recent = ids.length ? await this.prisma.saleTransaction.groupBy({
        by: ["tenantId"], where: { tenantId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { total: true }, _max: { createdAt: true },
      }) : [];
      const lastSale = ids.length ? await this.prisma.saleTransaction.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _max: { createdAt: true } }) : [];
      const recentBy = new Map(recent.map((row) => [row.tenantId, row]));
      const lastBy = new Map(lastSale.map((row) => [row.tenantId, row._max.createdAt]));
      return tenants.map(({ _count, ...tenant }) => {
        const usage = recentBy.get(tenant.id);
        const rows = _count.products + _count.customers + _count.transactions + _count.stockMovements + _count.auditLogs;
        return {
          ...tenant,
          usage: {
            users: _count.memberships, products: _count.products, customers: _count.customers, transactions: _count.transactions,
            images: _count.productImages, transactions30d: usage?._count._all ?? 0, revenue30d: Number(usage?._sum.total ?? 0),
            lastTransactionAt: lastBy.get(tenant.id) ?? null, estimatedDbBytes: rows * AVG_ROW_BYTES,
          },
        };
      });
    });
  }

  getTenant(id: string) {
    return this.unscoped(async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        select: {
          id: true, name: true, slug: true, status: true, suspendedAt: true, suspendReason: true, createdAt: true,
          memberships: { select: { createdAt: true, role: { select: { code: true } }, user: { select: { id: true, name: true, email: true } } } },
        },
      });
      if (!tenant) throw new NotFoundException("Tenant tidak ditemukan.");
      const recentAudit = await this.prisma.auditLog.findMany({
        where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, resource: true, createdAt: true },
      });
      return { ...tenant, recentAudit };
    });
  }

  setStatus(id: string, input: UpdateTenantStatusDto, actor: { sub: string; tenantId: string }) {
    if (id === actor.tenantId && input.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException("Super admin tidak dapat menangguhkan tokonya sendiri.");
    }
    if (input.status === TenantStatus.SUSPENDED && !input.reason?.trim()) {
      throw new BadRequestException("Alasan penangguhan wajib diisi.");
    }
    return this.unscoped(async () => {
      const existing = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException("Tenant tidak ditemukan.");
      const suspended = input.status === TenantStatus.SUSPENDED;
      const tenant = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.tenant.update({
          where: { id },
          data: { status: input.status, suspendedAt: suspended ? new Date() : null, suspendReason: suspended ? input.reason!.trim() : null },
          select: { id: true, name: true, slug: true, status: true, suspendedAt: true, suspendReason: true },
        });
        // Force sign-out of every session in a suspended tenant.
        if (suspended) await tx.refreshToken.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({ data: { tenantId: id, userId: actor.sub, action: suspended ? "PLATFORM_SUSPEND" : "PLATFORM_ACTIVATE", resource: `tenant:${id}` } });
        return updated;
      });
      this.auth.invalidateTenantStatus(id);
      return tenant;
    });
  }
}
