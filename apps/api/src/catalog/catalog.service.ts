import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { parse } from "csv-parse/sync";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  AttachImageDto,
  BulkPriceUpdateDto,
  CommitProductImportDto,
  CreateProductDto,
  ListProductsQueryDto,
  PresignImageDto,
  UpdateProductDto,
} from "./catalog.dto";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

@Injectable()
export class CatalogService {
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>("S3_BUCKET") ?? "";
    this.publicBaseUrl = (config.get<string>("S3_PUBLIC_URL") ?? "").replace(/\/$/, "");
    const endpoint = config.get<string>("S3_ENDPOINT");
    const region = config.get<string>("S3_REGION") ?? "auto";
    const accessKeyId = config.get<string>("S3_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("S3_SECRET_ACCESS_KEY");
    this.s3 = endpoint && accessKeyId && secretAccessKey
      ? new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
      : null;
  }

  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  createCategory(name: string) {
    const tenantId = this.requireTenantId();
    return this.handleUnique(
      () => this.prisma.category.create({ data: { tenantId, name: name.trim() } }),
      "Nama kategori sudah digunakan di toko ini.",
    );
  }

  async updateCategory(id: string, name: string) {
    if (!name?.trim()) throw new BadRequestException("Nama kategori wajib diisi.");
    await this.requireCategory(id);
    return this.handleUnique(
      () => this.prisma.category.update({ where: { id }, data: { name: name.trim() } }),
      "Nama kategori sudah digunakan di toko ini.",
    );
  }

  async deleteCategory(id: string) {
    await this.requireCategory(id);
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  async listProducts(query: ListProductsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const where: Prisma.ProductWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
              { barcode: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true, images: { orderBy: { position: "asc" } } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async getProduct(id: string, includeDeleted = false) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
      include: { category: true, images: { orderBy: { position: "asc" } } },
    });
    if (!product) throw new NotFoundException("Produk tidak ditemukan.");
    return product;
  }

  async createProduct(input: CreateProductDto) {
    const tenantId = this.requireTenantId();
    if (input.categoryId) await this.requireCategory(input.categoryId);
    return this.handleUnique(() => this.prisma.product.create({
      data: {
        tenantId,
        name: input.name.trim(), sku: input.sku.trim(), barcode: input.barcode?.trim(),
        description: input.description?.trim(), categoryId: input.categoryId,
        memberPrice: input.memberPrice, retailPrice: input.retailPrice, pv: input.pv ?? 0,
        isActive: input.isActive ?? true, lowStockLimit: input.lowStockLimit ?? 5,
      },
      include: { category: true, images: true },
    }), "SKU sudah digunakan di toko ini.");
  }

  async updateProduct(id: string, input: UpdateProductDto, changedByUserId?: string) {
    const before = await this.getProduct(id);
    if (input.categoryId) await this.requireCategory(input.categoryId);
    return this.handleUnique(() => this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...input,
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
          ...(input.categoryId === null ? { categoryId: null } : {}),
        },
        include: { category: true, images: { orderBy: { position: "asc" } } },
      });
      if (Number(before.memberPrice) !== Number(updated.memberPrice) || Number(before.retailPrice) !== Number(updated.retailPrice)) {
        await tx.productPriceHistory.create({
          data: {
            tenantId: this.requireTenantId(), productId: before.id,
            previousMemberPrice: before.memberPrice, previousRetailPrice: before.retailPrice,
            memberPrice: updated.memberPrice, retailPrice: updated.retailPrice,
            source: "manual", changedByUserId,
          },
        });
      }
      return updated;
    }), "SKU sudah digunakan di toko ini.");
  }

  async deleteProduct(id: string) {
    await this.getProduct(id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  async restoreProduct(id: string) {
    const product = await this.getProduct(id, true);
    if (!product.deletedAt) throw new BadRequestException("Produk ini belum diarsipkan.");
    await this.prisma.product.update({ where: { id }, data: { deletedAt: null } });
    return { restored: true };
  }

  async getPriceHistory(id: string) {
    await this.getProduct(id);
    return this.prisma.productPriceHistory.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  async updatePrices(input: BulkPriceUpdateDto, changedByUserId?: string) {
    if (input.memberPrice === undefined && input.retailPrice === undefined) {
      throw new BadRequestException("Isi harga member, harga retail, atau keduanya.");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: input.productIds }, deletedAt: null },
        select: { id: true, memberPrice: true, retailPrice: true },
      });
      if (products.length !== input.productIds.length) throw new NotFoundException("Sebagian produk tidak ditemukan atau sudah diarsipkan.");

      const histories = products.flatMap((product) => {
        const memberPrice = input.memberPrice ?? Number(product.memberPrice);
        const retailPrice = input.retailPrice ?? Number(product.retailPrice);
        if (memberPrice === Number(product.memberPrice) && retailPrice === Number(product.retailPrice)) return [];
        return [{
          tenantId: this.requireTenantId(), productId: product.id,
          previousMemberPrice: product.memberPrice, previousRetailPrice: product.retailPrice,
          memberPrice, retailPrice, source: "bulk", changedByUserId,
        }];
      });
      await tx.product.updateMany({
        where: { id: { in: input.productIds } },
        data: {
          ...(input.memberPrice !== undefined ? { memberPrice: input.memberPrice } : {}),
          ...(input.retailPrice !== undefined ? { retailPrice: input.retailPrice } : {}),
        },
      });
      if (histories.length) await tx.productPriceHistory.createMany({ data: histories });
      return { updatedCount: products.length, priceHistoryCount: histories.length };
    });
    return result;
  }

  async previewProductImport(csv: Buffer) {
    let rawRows: Record<string, string>[];
    try {
      rawRows = parse(csv, {
        bom: true, columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
        skip_empty_lines: true, trim: true, max_record_size: 16_384,
      }) as Record<string, string>[];
    } catch {
      throw new BadRequestException("CSV tidak valid. Periksa tanda kutip dan pemisah kolom.");
    }
    if (!rawRows.length) throw new BadRequestException("File CSV tidak memiliki baris produk.");
    if (rawRows.length > 500) throw new BadRequestException("Maksimal 500 produk per import.");
    const rows = rawRows.map((raw) => ({
      name: raw.name?.trim() ?? "", sku: raw.sku?.trim() ?? "",
      barcode: raw.barcode?.trim() || undefined, description: raw.description?.trim() || undefined,
      category: raw.category?.trim() || undefined,
      memberPrice: raw.memberprice?.trim() ? Number(raw.memberprice) : Number.NaN,
      retailPrice: raw.retailprice?.trim() ? Number(raw.retailprice) : Number.NaN,
      pv: raw.pv?.trim() ? Number(raw.pv) : 0,
    }));
    return this.validateImportRows(rows);
  }

  async commitProductImport(input: CommitProductImportDto) {
    const preview = await this.validateImportRows(input.rows);
    if (preview.invalidCount > 0) {
      throw new BadRequestException({
        message: "Import dibatalkan karena ada baris yang tidak valid.",
        errors: preview.rows.filter((row) => row.errors.length).slice(0, 20),
      });
    }
    const categories = await this.prisma.category.findMany({ select: { id: true, name: true } });
    const categoryIds = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
    const rows = input.rows.map((row) => ({
      tenantId: this.requireTenantId(), name: row.name.trim(), sku: row.sku.trim(),
      barcode: row.barcode?.trim(), description: row.description?.trim(),
      categoryId: row.category ? categoryIds.get(row.category.toLowerCase()) : null,
      memberPrice: row.memberPrice, retailPrice: row.retailPrice, pv: row.pv ?? 0,
    }));
    try {
      const result = await this.prisma.product.createMany({ data: rows });
      return { importedCount: result.count };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("SKU produk berubah atau sudah digunakan. Upload ulang CSV untuk membuat preview baru.");
      }
      throw error;
    }
  }

  private async validateImportRows(rows: Array<{
    name: string; sku: string; barcode?: string; description?: string; category?: string;
    memberPrice: number; retailPrice: number; pv?: number;
  }>) {
    const seen = new Set<string>();
    const skus = rows.map((row) => row.sku.trim()).filter(Boolean);
    const [existing, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } }),
      this.prisma.category.findMany({ select: { name: true } }),
    ]);
    const existingSkus = new Set(existing.map((product) => product.sku.toLowerCase()));
    const categoryNames = new Set(categories.map((category) => category.name.toLowerCase()));
    const previewRows = rows.map((row, index) => {
      const errors: string[] = [];
      const sku = row.sku.trim().toLowerCase();
      if (!row.name.trim()) errors.push("Nama produk wajib diisi.");
      if (row.name.trim().length > 160) errors.push("Nama produk maksimal 160 karakter.");
      if (!sku) errors.push("SKU wajib diisi.");
      if (sku.length > 64) errors.push("SKU maksimal 64 karakter.");
      if (sku && seen.has(sku)) errors.push("SKU duplikat di dalam CSV.");
      if (sku && existingSkus.has(sku)) errors.push("SKU sudah ada di toko.");
      if (!Number.isFinite(row.memberPrice) || row.memberPrice < 0) errors.push("Harga member harus angka nol atau lebih.");
      if (!Number.isFinite(row.retailPrice) || row.retailPrice < 0) errors.push("Harga retail harus angka nol atau lebih.");
      if (row.pv !== undefined && (!Number.isFinite(row.pv) || row.pv < 0)) errors.push("PV harus angka nol atau lebih.");
      if (row.category && !categoryNames.has(row.category.toLowerCase())) errors.push(`Kategori “${row.category}” belum tersedia.`);
      if (row.barcode && row.barcode.length > 64) errors.push("Barcode maksimal 64 karakter.");
      if (row.description && row.description.length > 2000) errors.push("Deskripsi maksimal 2000 karakter.");
      if (row.category && row.category.length > 80) errors.push("Kategori maksimal 80 karakter.");
      if (sku) seen.add(sku);
      return { rowNumber: index + 2, ...row, errors };
    });
    const validCount = previewRows.filter((row) => row.errors.length === 0).length;
    return { total: rows.length, validCount, invalidCount: rows.length - validCount, rows: previewRows };
  }


  async createImageUpload(input: PresignImageDto) {
    if (!this.s3 || !this.bucket || !this.publicBaseUrl) {
      throw new ServiceUnavailableException("Upload gambar belum dikonfigurasi. Atur S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, dan S3_PUBLIC_URL.");
    }
    if (!IMAGE_TYPES.has(input.contentType)) throw new BadRequestException("Format gambar harus JPEG, PNG, atau WebP.");
    const extension = extname(input.fileName).toLowerCase();
    const safeExtension = extension && /^\.(jpe?g|png|webp)$/.test(extension) ? extension : "";
    const key = `tenants/${this.requireTenantId()}/products/${randomUUID()}${safeExtension}`;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: input.contentType });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    return { key, uploadUrl, publicUrl: `${this.publicBaseUrl}/${key}`, expiresIn: 300 };
  }

  async attachImage(productId: string, input: AttachImageDto) {
    const product = await this.getProduct(productId);
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId || !input.key.startsWith(`tenants/${tenantId}/products/`) || !input.url.startsWith(`${this.publicBaseUrl}/`)) {
      throw new BadRequestException("Key atau URL gambar tidak valid untuk tenant ini.");
    }
    const image = await this.prisma.productImage.create({
      data: { tenantId: tenantId!, productId: product.id, key: input.key, url: input.url, alt: input.alt, position: input.position ?? 0 },
    });
    return image;
  }

  async removeImage(productId: string, imageId: string) {
    await this.getProduct(productId);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException("Gambar produk tidak ditemukan.");
    await this.prisma.productImage.delete({ where: { id: imageId } });
    return { deleted: true };
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Kategori tidak ditemukan.");
    return category;
  }

  private requireTenantId() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException("Tenant context tidak tersedia.");
    return tenantId;
  }

  private async handleUnique<T>(operation: () => Promise<T>, message: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(message);
      }
      throw error;
    }
  }
}
