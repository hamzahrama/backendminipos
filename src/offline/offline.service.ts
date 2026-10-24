import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { buildOfflineSnapshot, OfflineProductSnapshot } from "./offline";

@Injectable()
export class OfflineService {
  constructor(private readonly prisma: PrismaService) {}

  async getProductSnapshot(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        memberPrice: true,
        retailPrice: true,
        pv: true,
      },
    });

    // Compute stock (total dari semua batch yang belum kedaluwarsa di semua warehouse)
    const batches = await this.prisma.productBatch.findMany({
      where: {
        tenantId,
        product: {
          deletedAt: null,
        },
        expiryDate: {
          gt: new Date(),
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    const stockByProduct = new Map<string, number>();
    for (const batch of batches) {
      const current = stockByProduct.get(batch.productId) || 0;
      stockByProduct.set(batch.productId, current + Number(batch.quantity));
    }

    const snapshot: OfflineProductSnapshot[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      memberPrice: Number(p.memberPrice),
      retailPrice: Number(p.retailPrice),
      pv: Number(p.pv),
      stock: stockByProduct.get(p.id) || 0,
    }));

    return buildOfflineSnapshot(snapshot);
  }
}
