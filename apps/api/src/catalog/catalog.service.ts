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
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  AttachImageDto,
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

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
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
        isActive: input.isActive ?? true,
      },
      include: { category: true, images: true },
    }), "SKU sudah digunakan di toko ini.");
  }

  async updateProduct(id: string, input: UpdateProductDto) {
    await this.getProduct(id);
    if (input.categoryId) await this.requireCategory(input.categoryId);
    return this.handleUnique(() => this.prisma.product.update({
      where: { id },
      data: {
        ...input,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
        ...(input.categoryId === null ? { categoryId: null } : {}),
      },
      include: { category: true, images: { orderBy: { position: "asc" } } },
    }), "SKU sudah digunakan di toko ini.");
  }

  async deleteProduct(id: string) {
    await this.getProduct(id);
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }

  async createImageUpload(input: PresignImageDto) {
    if (!this.s3 || !this.bucket || !this.publicBaseUrl) {
      throw new ServiceUnavailableException("Upload gambar belum dikonfigurasi. Atur S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, dan S3_PUBLIC_URL.");
    }
    if (!IMAGE_TYPES.has(input.contentType)) throw new BadRequestException("Format gambar harus JPEG, PNG, atau WebP.");
    const extension = extname(input.fileName).toLowerCase();
    const safeExtension = extension && /^\.(jpe?g|png|webp)$/.test(extension) ? extension : "";
    const key = `tenants/${this.tenantContext.getTenantId()}/products/${randomUUID()}${safeExtension}`;
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
