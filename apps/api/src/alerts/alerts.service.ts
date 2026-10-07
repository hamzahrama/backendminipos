import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.refreshAllTenants();
    } catch (error) {
      this.logger.error("Pemeriksaan alert awal gagal.", error instanceof Error ? error.stack : undefined);
    }
  }

  @Cron("0 0 * * *", { timeZone: "Asia/Jakarta" })
  async refreshDaily() {
    try {
      const count = await this.refreshAllTenants();
      this.logger.log(`Pemeriksaan harian selesai; ${count} alert aktif ditemukan.`);
    } catch (error) {
      this.logger.error("Pemeriksaan alert harian gagal.", error instanceof Error ? error.stack : undefined);
    }
  }

  async getActiveAlerts(tenantId: string) {
    await this.refreshTenant(tenantId);
    return this.prisma.inventoryAlert.findMany({
      where: { tenantId, resolvedAt: null },
      include: {
        product: { select: { id: true, name: true, sku: true, lowStockLimit: true } },
        batch: { select: { id: true, batchCode: true, expiryDate: true } },
      },
      orderBy: [{ expiresAt: "asc" }, { observedAt: "desc" }],
    });
  }

  private async refreshAllTenants() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let total = 0;
    for (const tenant of tenants) total += await this.refreshTenant(tenant.id);
    return total;
  }

  private async refreshTenant(tenantId: string) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + 30);
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, name: true, lowStockLimit: true,
        batches: {
          where: { quantity: { gt: 0 } },
          select: { id: true, batchCode: true, quantity: true, expiryDate: true },
        },
      },
    });
    const alerts: Array<{
      tenantId: string; fingerprint: string; kind: string; productId: string; batchId: string | null;
      message: string; quantity: number | null; expiresAt: Date | null;
    }> = [];
    for (const product of products) {
      const totalQuantity = product.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
      if (totalQuantity < product.lowStockLimit) {
        alerts.push({
          tenantId, fingerprint: `LOW_STOCK:${product.id}`, kind: "LOW_STOCK", productId: product.id,
          batchId: null, message: `Stok ${product.name} tersisa ${totalQuantity}; batas minimum ${product.lowStockLimit}.`,
          quantity: totalQuantity, expiresAt: null,
        });
      }
      for (const batch of product.batches) {
        if (!batch.expiryDate || batch.expiryDate > threshold) continue;
        alerts.push({
          tenantId, fingerprint: `EXPIRY:${batch.id}`, kind: "EXPIRY", productId: product.id,
          batchId: batch.id, message: `Batch ${batch.batchCode} dari ${product.name} kedaluwarsa ${batch.expiryDate.toISOString().slice(0, 10)}.`,
          quantity: Number(batch.quantity), expiresAt: batch.expiryDate,
        });
      }
    }

    const fingerprints = alerts.map((alert) => alert.fingerprint);
    await this.prisma.inventoryAlert.updateMany({
      where: {
        tenantId, resolvedAt: null,
        ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}),
      },
      data: { resolvedAt: now },
    });
    for (const alert of alerts) {
      await this.prisma.inventoryAlert.upsert({
        where: { tenantId_fingerprint: { tenantId, fingerprint: alert.fingerprint } },
        create: { ...alert, observedAt: now },
        update: {
          kind: alert.kind, productId: alert.productId, batchId: alert.batchId,
          message: alert.message, quantity: alert.quantity, expiresAt: alert.expiresAt,
          observedAt: now, resolvedAt: null,
        },
      });
    }
    return alerts.length;
  }
}
