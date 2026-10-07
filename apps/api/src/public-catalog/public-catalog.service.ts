import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listEnabledSlugs() {
    return this.prisma.tenant.findMany({
      where: { publicCatalogEnabled: true, status: "ACTIVE" }, select: { slug: true, updatedAt: true }, orderBy: { name: "asc" },
    });
  }

  async getCatalog(slug: string, query: { search?: string; category?: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, publicCatalogEnabled: true, whatsAppNumber: true, status: true },
    });
    if (!tenant || !tenant.publicCatalogEnabled || tenant.status !== "ACTIVE") throw new NotFoundException("Katalog toko tidak tersedia.");

    const todayJakarta = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const today = new Date(`${todayJakarta}T00:00:00.000Z`);
    const products = await this.prisma.product.findMany({
      where: {
        tenantId: tenant.id, deletedAt: null, isActive: true,
        ...(query.category ? { category: { name: query.category } } : {}),
        ...(query.search ? { OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { sku: { contains: query.search, mode: "insensitive" } },
        ] } : {}),
        batches: { some: { tenantId: tenant.id, quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] } },
      },
      select: {
        id: true, name: true, sku: true, description: true, memberPrice: true,
        retailPrice: true, pv: true, category: { select: { name: true } },
        images: { select: { url: true, position: true }, orderBy: { position: "asc" }, take: 1 },
        batches: {
          where: { tenantId: tenant.id, quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] },
          select: { quantity: true },
        },
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });
    const categories = await this.prisma.category.findMany({
      where: { tenantId: tenant.id, products: { some: { isActive: true, deletedAt: null, batches: { some: { quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] } } } } },
      select: { name: true }, orderBy: { name: "asc" },
    });

    return {
      store: { name: tenant.name, slug: tenant.slug, whatsAppNumber: tenant.whatsAppNumber },
      categories: categories.map(({ name }) => name),
      products: products.map(({ batches, ...product }) => ({
        ...product, availableQuantity: batches.reduce((total, batch) => total + Number(batch.quantity), 0),
      })),
    };
  }

  async getProduct(slug: string, productId: string) {
    const catalog = await this.getCatalog(slug, {});
    const product = catalog.products.find((item) => item.id === productId);
    if (!product) throw new NotFoundException("Produk tidak ditemukan atau stoknya habis.");
    return { store: catalog.store, product };
  }

  getSettings(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId }, select: { publicCatalogEnabled: true, whatsAppNumber: true, dailyReportEnabled: true, dailyReportHour: true },
    });
  }

  updateSettings(tenantId: string, input: { publicCatalogEnabled?: boolean; whatsAppNumber?: string | null; dailyReportEnabled?: boolean; dailyReportHour?: number }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.publicCatalogEnabled !== undefined ? { publicCatalogEnabled: input.publicCatalogEnabled } : {}),
        ...(input.whatsAppNumber !== undefined ? { whatsAppNumber: input.whatsAppNumber?.trim() || null } : {}),
        ...(input.dailyReportEnabled !== undefined ? { dailyReportEnabled: input.dailyReportEnabled } : {}),
        ...(input.dailyReportHour !== undefined ? { dailyReportHour: input.dailyReportHour } : {}),
      },
      select: { publicCatalogEnabled: true, whatsAppNumber: true, dailyReportEnabled: true, dailyReportHour: true },
    });
  }
}
