import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Warehouse } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateWarehouseDto, FefoPreviewDto, StockInDto } from "./inventory.dto";

type BatchAllocation = { batchId: string; batchCode: string; warehouseId: string; quantity: number; expiryDate: Date | null };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContextService) {}

  listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  }

  async createWarehouse(input: CreateWarehouseDto) {
    const name = input.name.trim();
    const code = input.code.trim().toUpperCase();
    if (!name || !/^[A-Z0-9_-]{2,24}$/.test(code)) {
      throw new BadRequestException("Nama gudang wajib diisi dan kode harus 2–24 karakter alfanumerik.");
    }
    const tenantId = this.requireTenantId();
    const count = await this.prisma.warehouse.count();
    try {
      return await this.prisma.warehouse.create({
        data: { tenantId, name, code, isDefault: count === 0 },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Kode gudang sudah digunakan di toko ini.");
      }
      throw error;
    }
  }

  async receiveStock(input: StockInDto, userId?: string) {
    const tenantId = this.requireTenantId();
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new NotFoundException("Produk tidak ditemukan atau sudah diarsipkan.");

    try {
      return await this.prisma.$transaction(async (tx) => {
        let warehouse: Warehouse;
        if (input.warehouseId) {
          const selectedWarehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
          if (!selectedWarehouse) throw new NotFoundException("Gudang tidak ditemukan.");
          warehouse = selectedWarehouse;
        } else {
          const defaultWarehouse = await tx.warehouse.findFirst({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
          if (defaultWarehouse) warehouse = defaultWarehouse;
          else {
            warehouse = await tx.warehouse.upsert({
              where: { tenantId_code: { tenantId, code: "MAIN" } },
              update: {},
              create: { tenantId, name: "Gudang Utama", code: "MAIN", isDefault: true },
            });
          }
        }

        const expiryDate = input.expiryDate ? new Date(`${input.expiryDate.slice(0, 10)}T00:00:00.000Z`) : null;
        const batchWhere = {
          tenantId_productId_warehouseId_batchCode: {
            tenantId, productId: product.id, warehouseId: warehouse.id, batchCode: input.batchCode.trim(),
          },
        };
        const existing = await tx.productBatch.findUnique({ where: batchWhere });
        let batch;
        if (existing) {
          if ((existing.expiryDate?.toISOString() ?? null) !== (expiryDate?.toISOString() ?? null)) {
            throw new ConflictException("Kode batch yang sama sudah terdaftar dengan tanggal kedaluwarsa berbeda.");
          }
          if (input.unitCost !== undefined && Number(existing.unitCost) !== input.unitCost) {
            throw new ConflictException("Kode batch yang sama sudah terdaftar dengan harga pokok berbeda.");
          }
          batch = await tx.productBatch.update({
            where: { id: existing.id },
            data: { quantity: { increment: input.quantity }, receivedQuantity: { increment: input.quantity } },
            include: { warehouse: true },
          });
        } else {
          batch = await tx.productBatch.create({
            data: {
              tenantId, productId: product.id, warehouseId: warehouse.id,
              batchCode: input.batchCode.trim(), expiryDate, quantity: input.quantity,
              receivedQuantity: input.quantity, unitCost: input.unitCost,
            },
            include: { warehouse: true },
          });
        }
        await tx.stockMovement.create({
          data: {
            tenantId, productId: product.id, batchId: batch.id, warehouseId: warehouse.id,
            type: "IN", quantity: input.quantity, note: input.note, createdBy: userId,
          },
        });
        return batch;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Kode batch sudah digunakan di gudang ini.");
      }
      throw error;
    }
  }

  async listProductBatches(productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException("Produk tidak ditemukan.");
    return this.prisma.productBatch.findMany({
      where: { productId }, include: { warehouse: true },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    });
  }

  async stockSummary() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, sku: true, lowStockLimit: true,
        batches: { select: { quantity: true } },
      },
      orderBy: { name: "asc" },
    });
    return products.map(({ batches, ...product }) => ({
      ...product,
      quantity: batches.reduce((sum, batch) => sum + Number(batch.quantity), 0),
    }));
  }

  async previewFefo(input: FefoPreviewDto) {
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new NotFoundException("Produk tidak ditemukan.");
    const allocations = await this.allocateFefo(this.prisma, input.productId, input.quantity, input.warehouseId);
    return { productId: input.productId, requestedQuantity: input.quantity, allocations };
  }

  /** Consume stock inside the caller's transaction; intended for the checkout flow. */
  async consumeByFefo(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
    options: { warehouseId?: string; reference?: string; userId?: string } = {},
  ): Promise<BatchAllocation[]> {
    const allocations = await this.allocateFefo(tx, productId, quantity, options.warehouseId);
    const tenantId = this.requireTenantId();
    for (const allocation of allocations) {
      const consumed = await tx.productBatch.updateMany({
        where: { id: allocation.batchId, quantity: { gte: allocation.quantity } },
        data: { quantity: { decrement: allocation.quantity } },
      });
      if (consumed.count !== 1) throw new ConflictException("Stok batch berubah. Coba ulang transaksi.");
      await tx.stockMovement.create({
        data: {
          tenantId, productId, batchId: allocation.batchId, warehouseId: allocation.warehouseId,
          type: "OUT", quantity: allocation.quantity, reference: options.reference, createdBy: options.userId,
        },
      });
    }
    return allocations;
  }

  private async allocateFefo(
    client: PrismaService | Prisma.TransactionClient,
    productId: string,
    requestedQuantity: number,
    warehouseId?: string,
  ): Promise<BatchAllocation[]> {
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new BadRequestException("Jumlah stok harus lebih dari nol.");
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const batches = await client.productBatch.findMany({
      where: {
        productId, quantity: { gt: 0 },
        ...(warehouseId ? { warehouseId } : {}),
        OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
      },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
    });
    // Round to the 2-decimal stock precision so float drift (0.7 + 0.1 = 0.7999…) cannot reject a valid request.
    const available = Number(batches.reduce((sum, batch) => sum + Number(batch.quantity), 0).toFixed(2));
    if (available < requestedQuantity) {
      throw new BadRequestException(`Stok tidak cukup. Tersedia ${available}, diminta ${requestedQuantity}.`);
    }
    let remaining = requestedQuantity;
    const allocations: BatchAllocation[] = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const quantity = Math.min(Number(batch.quantity), remaining);
      allocations.push({
        batchId: batch.id, batchCode: batch.batchCode, warehouseId: batch.warehouseId,
        quantity, expiryDate: batch.expiryDate,
      });
      remaining = Number((remaining - quantity).toFixed(2));
    }
    return allocations;
  }

  private requireTenantId() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException("Tenant context tidak tersedia.");
    return tenantId;
  }
}
