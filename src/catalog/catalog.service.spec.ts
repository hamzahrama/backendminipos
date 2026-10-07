import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CatalogService } from "./catalog.service";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/upload"),
}));

const S3_CONFIG = {
  S3_BUCKET: "bucket",
  S3_PUBLIC_URL: "https://cdn.example/",
  S3_ENDPOINT: "https://s3.example",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5" });
}

function makeService(prisma: Record<string, unknown>, config: Record<string, string> = {}) {
  const context = new TenantContextService();
  const configService = { get: (key: string) => config[key] } as unknown as ConfigService;
  const service = new CatalogService(prisma as unknown as PrismaService, context, configService);
  return { service, run: <T>(fn: () => Promise<T>) => context.run("tenant-1", fn) };
}

function withTransaction<T extends Record<string, unknown>>(prisma: T) {
  const fake = prisma as T & { $transaction: ReturnType<typeof vi.fn> };
  fake.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(fake) : Promise.all(arg as unknown[]),
  );
  return fake;
}

const product = { id: "p1", memberPrice: 10000, retailPrice: 12000, deletedAt: null };

describe("CatalogService categories", () => {
  it("lists categories sorted by name", async () => {
    const prisma = { category: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) } };
    const { service } = makeService(prisma);
    await expect(service.listCategories()).resolves.toEqual([{ id: "c1" }]);
    expect(prisma.category.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
  });

  it("creates a trimmed category for the current tenant", async () => {
    const prisma = { category: { create: vi.fn().mockResolvedValue({ id: "c1" }) } };
    const { service, run } = makeService(prisma);
    await run(() => service.createCategory("  Madu  "));
    expect(prisma.category.create).toHaveBeenCalledWith({ data: { tenantId: "tenant-1", name: "Madu" } });
  });

  it("requires tenant context to create", () => {
    const { service } = makeService({ category: { create: vi.fn() } });
    expect(() => service.createCategory("Madu")).toThrow(ForbiddenException);
  });

  it("maps duplicate names to ConflictException and rethrows others", async () => {
    const prisma = { category: { create: vi.fn().mockRejectedValueOnce(uniqueError()).mockRejectedValueOnce(new Error("boom")) } };
    const { service, run } = makeService(prisma);
    await expect(run(() => service.createCategory("Madu"))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.createCategory("Madu"))).rejects.toThrow("boom");
  });

  it("updates a category, validating name and existence", async () => {
    const prisma = {
      category: {
        findUnique: vi.fn().mockResolvedValueOnce({ id: "c1" }).mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({ id: "c1", name: "Herbal" }),
      },
    };
    const { service } = makeService(prisma);
    await expect(service.updateCategory("c1", "   ")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateCategory("c1", " Herbal ")).resolves.toEqual({ id: "c1", name: "Herbal" });
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "Herbal" } });
    await expect(service.updateCategory("missing", "X")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes an existing category", async () => {
    const prisma = { category: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }), delete: vi.fn() } };
    const { service } = makeService(prisma);
    await expect(service.deleteCategory("c1")).resolves.toEqual({ deleted: true });
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("CatalogService products", () => {
  it("lists products with filters and pagination", async () => {
    const prisma = withTransaction({
      product: { findMany: vi.fn().mockResolvedValue([product]), count: vi.fn().mockResolvedValue(21) },
    });
    const { service } = makeService(prisma);
    const result = await service.listProducts({ page: 3, limit: 10, search: "madu", categoryId: "c1", includeDeleted: false });
    expect(result).toEqual({ items: [product], page: 3, limit: 10, total: 21, totalPages: 3 });
    const args = prisma.product.findMany.mock.calls[0][0];
    expect(args.skip).toBe(20);
    expect(args.where).toMatchObject({ deletedAt: null, categoryId: "c1" });
    expect(args.where.OR).toHaveLength(3);
  });

  it("uses defaults and includes deleted products when asked", async () => {
    const prisma = withTransaction({
      product: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    });
    const { service } = makeService(prisma);
    const result = await service.listProducts({ includeDeleted: true } as never);
    expect(result).toMatchObject({ page: 1, limit: 10, totalPages: 0 });
    expect(prisma.product.count).toHaveBeenCalledWith({ where: {} });
  });

  it("gets a product or throws NotFound", async () => {
    const prisma = { product: { findFirst: vi.fn().mockResolvedValueOnce(product).mockResolvedValueOnce(null) } };
    const { service } = makeService(prisma);
    await expect(service.getProduct("p1", true)).resolves.toBe(product);
    expect(prisma.product.findFirst.mock.calls[0][0].where).toEqual({ id: "p1" });
    await expect(service.getProduct("p2")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates a product with defaults and trimmed fields", async () => {
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }) },
      product: { create: vi.fn().mockResolvedValue(product) },
    };
    const { service, run } = makeService(prisma);
    await run(() => service.createProduct({ name: " Madu ", sku: " SKU1 ", barcode: " 123 ", categoryId: "c1", memberPrice: 1, retailPrice: 2 }));
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-1", name: "Madu", sku: "SKU1", barcode: "123", pv: 0, isActive: true, lowStockLimit: 5,
    });
  });

  it("rejects unknown category and duplicate SKU on create", async () => {
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue(null) },
      product: { create: vi.fn().mockRejectedValue(uniqueError()) },
    };
    const { service, run } = makeService(prisma);
    await expect(run(() => service.createProduct({ name: "A", sku: "B", categoryId: "x", memberPrice: 1, retailPrice: 1 }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(run(() => service.createProduct({ name: "A", sku: "B", memberPrice: 1, retailPrice: 1, pv: 2, isActive: false, lowStockLimit: 1 }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates a product and records price history when prices change", async () => {
    const prisma = withTransaction({
      category: { findUnique: vi.fn().mockResolvedValue({ id: "c2" }) },
      product: {
        findFirst: vi.fn().mockResolvedValue(product),
        update: vi.fn().mockResolvedValue({ ...product, memberPrice: 9000 }),
      },
      productPriceHistory: { create: vi.fn() },
    });
    const { service, run } = makeService(prisma);
    await run(() => service.updateProduct("p1", { name: " New ", sku: " S2 ", categoryId: "c2", memberPrice: 9000 }, "u1"));
    expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({ name: "New", sku: "S2", categoryId: "c2" });
    expect(prisma.productPriceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant-1", productId: "p1", previousMemberPrice: 10000, memberPrice: 9000, source: "manual", changedByUserId: "u1" }),
    });
  });

  it("skips price history when prices are unchanged and clears category", async () => {
    const prisma = withTransaction({
      category: { findUnique: vi.fn() },
      product: { findFirst: vi.fn().mockResolvedValue(product), update: vi.fn().mockResolvedValue(product) },
      productPriceHistory: { create: vi.fn() },
    });
    const { service, run } = makeService(prisma);
    await run(() => service.updateProduct("p1", { categoryId: null, isActive: false }));
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({ categoryId: null, isActive: false });
    expect(prisma.productPriceHistory.create).not.toHaveBeenCalled();
  });

  it("maps duplicate SKU on update to Conflict", async () => {
    const prisma = withTransaction({
      product: { findFirst: vi.fn().mockResolvedValue(product), update: vi.fn().mockRejectedValue(uniqueError()) },
    });
    const { service, run } = makeService(prisma);
    await expect(run(() => service.updateProduct("p1", { sku: "dup" }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("soft deletes and restores products", async () => {
    const prisma = {
      product: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(product)
          .mockResolvedValueOnce({ ...product, deletedAt: new Date() })
          .mockResolvedValueOnce(product),
        update: vi.fn(),
      },
    };
    const { service } = makeService(prisma);
    await expect(service.deleteProduct("p1")).resolves.toEqual({ deleted: true });
    expect(prisma.product.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    await expect(service.restoreProduct("p1")).resolves.toEqual({ restored: true });
    expect(prisma.product.update.mock.calls[1][0]).toEqual({ where: { id: "p1" }, data: { deletedAt: null } });
    await expect(service.restoreProduct("p1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns price history for an existing product", async () => {
    const prisma = {
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      productPriceHistory: { findMany: vi.fn().mockResolvedValue([{ id: "h1" }]) },
    };
    const { service } = makeService(prisma);
    await expect(service.getPriceHistory("p1")).resolves.toEqual([{ id: "h1" }]);
    expect(prisma.productPriceHistory.findMany).toHaveBeenCalledWith({ where: { productId: "p1" }, orderBy: { createdAt: "desc" } });
  });
});

describe("CatalogService.updatePrices", () => {
  it("requires at least one price", async () => {
    const { service } = makeService({});
    await expect(service.updatePrices({ productIds: ["p1"] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when some products are missing", async () => {
    const prisma = withTransaction({ product: { findMany: vi.fn().mockResolvedValue([product]), updateMany: vi.fn() } });
    const { service, run } = makeService(prisma);
    await expect(run(() => service.updatePrices({ productIds: ["p1", "p2"], memberPrice: 1 }))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("updates prices and writes history only for changed products", async () => {
    const prisma = withTransaction({
      product: {
        findMany: vi.fn().mockResolvedValue([product, { id: "p2", memberPrice: 5000, retailPrice: 12000 }]),
        updateMany: vi.fn(),
      },
      productPriceHistory: { createMany: vi.fn() },
    });
    const { service, run } = makeService(prisma);
    const result = await run(() => service.updatePrices({ productIds: ["p1", "p2"], retailPrice: 12000, memberPrice: 10000 }, "u1"));
    expect(result).toEqual({ updatedCount: 2, priceHistoryCount: 1 });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1", "p2"] } }, data: { memberPrice: 10000, retailPrice: 12000 },
    });
    expect(prisma.productPriceHistory.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ productId: "p2", previousMemberPrice: 5000, memberPrice: 10000, retailPrice: 12000, source: "bulk", tenantId: "tenant-1" }),
    ]);
  });

  it("does not create history when nothing changed", async () => {
    const prisma = withTransaction({
      product: { findMany: vi.fn().mockResolvedValue([product]), updateMany: vi.fn() },
      productPriceHistory: { createMany: vi.fn() },
    });
    const { service, run } = makeService(prisma);
    const result = await run(() => service.updatePrices({ productIds: ["p1"], retailPrice: 12000 }));
    expect(result).toEqual({ updatedCount: 1, priceHistoryCount: 0 });
    expect(prisma.product.updateMany.mock.calls[0][0].data).toEqual({ retailPrice: 12000 });
    expect(prisma.productPriceHistory.createMany).not.toHaveBeenCalled();
  });
});

describe("CatalogService product import", () => {
  function importPrisma(existingSkus: string[] = [], categories: Array<{ id: string; name: string }> = [{ id: "c1", name: "Madu" }]) {
    return {
      product: {
        findMany: vi.fn().mockResolvedValue(existingSkus.map((sku) => ({ sku }))),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      category: { findMany: vi.fn().mockResolvedValue(categories) },
    };
  }

  it("parses CSV with BOM and case-insensitive headers into a valid preview", async () => {
    const { service } = makeService(importPrisma());
    const csv = Buffer.from("\uFEFFName,SKU,Barcode,Description,Category,MemberPrice,RetailPrice,PV\nMadu,M1,123,Desc,madu,10000,12000,1.5\n");
    const result = await service.previewProductImport(csv);
    expect(result).toMatchObject({ total: 1, validCount: 1, invalidCount: 0 });
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, name: "Madu", sku: "M1", barcode: "123", category: "madu", memberPrice: 10000, retailPrice: 12000, pv: 1.5, errors: [] });
  });

  it("reports validation errors per row", async () => {
    const { service } = makeService(importPrisma(["EXIST"]));
    const longName = "x".repeat(161);
    const csv = Buffer.from([
      "name,sku,memberprice,retailprice,pv,category,barcode",
      `${longName},exist,abc,-1,-2,Unknown,${"b".repeat(65)}`,
      ",,,,,,",
      `A,${"s".repeat(65)},1,1,,,`,
      "B,DUP,1,1,,,",
      "C,dup,1,1,,,",
    ].join("\n"));
    const result = await service.previewProductImport(csv);
    expect(result).toMatchObject({ total: 5, validCount: 1, invalidCount: 4 });
    expect(result.rows[0].errors).toEqual([
      "Nama produk maksimal 160 karakter.",
      "SKU sudah ada di toko.",
      "Harga member harus angka nol atau lebih.",
      "Harga retail harus angka nol atau lebih.",
      "PV harus angka nol atau lebih.",
      "Kategori “Unknown” belum tersedia.",
      "Barcode maksimal 64 karakter.",
    ]);
    expect(result.rows[1].errors).toEqual(expect.arrayContaining(["Nama produk wajib diisi.", "SKU wajib diisi."]));
    expect(result.rows[2].errors).toEqual(["SKU maksimal 64 karakter."]);
    expect(result.rows[3].errors).toEqual([]);
    expect(result.rows[4].errors).toEqual(["SKU duplikat di dalam CSV."]);
  });

  it("validates description and category length", async () => {
    const { service } = makeService(importPrisma([], [{ id: "c", name: "k".repeat(81) }]));
    const result = await service.commitProductImport({
      rows: [{ name: "A", sku: "A", memberPrice: 1, retailPrice: 1, pv: 0, description: "d".repeat(2001), category: "k".repeat(81) }],
    }).catch((error: BadRequestException) => error.getResponse() as { errors: Array<{ errors: string[] }> });
    expect("errors" in result && result.errors[0].errors).toEqual(["Deskripsi maksimal 2000 karakter.", "Kategori maksimal 80 karakter."]);
  });

  it("rejects malformed, empty and oversized CSV", async () => {
    const { service } = makeService(importPrisma());
    await expect(service.previewProductImport(Buffer.from('name,sku\n"unterminated,x\n'))).rejects.toThrow("CSV tidak valid");
    await expect(service.previewProductImport(Buffer.from("name,sku\n"))).rejects.toThrow("tidak memiliki baris");
    const many = ["name,sku,memberprice,retailprice", ...Array.from({ length: 501 }, (_, i) => `P${i},S${i},1,1`)].join("\n");
    await expect(service.previewProductImport(Buffer.from(many))).rejects.toThrow("Maksimal 500");
  });

  it("commits valid rows mapping category names to ids", async () => {
    const prisma = importPrisma();
    const { service, run } = makeService(prisma);
    const result = await run(() => service.commitProductImport({
      rows: [
        { name: " Madu ", sku: " M1 ", category: "MADU", memberPrice: 1, retailPrice: 2, pv: 0, barcode: " 1 ", description: " d " },
        { name: "Teh", sku: "T1", memberPrice: 1, retailPrice: 2 } as never,
      ],
    }));
    expect(result).toEqual({ importedCount: 1 });
    expect(prisma.product.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: "tenant-1", name: "Madu", sku: "M1", barcode: "1", description: "d", categoryId: "c1", memberPrice: 1, retailPrice: 2, pv: 0 },
      { tenantId: "tenant-1", name: "Teh", sku: "T1", barcode: undefined, description: undefined, categoryId: null, memberPrice: 1, retailPrice: 2, pv: 0 },
    ]);
  });

  it("aborts commit when rows are invalid", async () => {
    const prisma = importPrisma(["M1"]);
    const { service, run } = makeService(prisma);
    await expect(run(() => service.commitProductImport({ rows: [{ name: "Madu", sku: "M1", memberPrice: 1, retailPrice: 1, pv: 0 }] }))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.createMany).not.toHaveBeenCalled();
  });

  it("maps unique violations during commit to Conflict and rethrows other errors", async () => {
    const prisma = importPrisma();
    prisma.product.createMany.mockRejectedValueOnce(uniqueError()).mockRejectedValueOnce(new Error("db down"));
    const { service, run } = makeService(prisma);
    const input = { rows: [{ name: "Madu", sku: "M1", memberPrice: 1, retailPrice: 1, pv: 0 }] };
    await expect(run(() => service.commitProductImport(input))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(() => service.commitProductImport(input))).rejects.toThrow("db down");
  });
});

describe("CatalogService images", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses presign when S3 is not configured", async () => {
    const { service, run } = makeService({});
    await expect(run(() => service.createImageUpload({ fileName: "a.png", contentType: "image/png", size: 1 }))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects unsupported content types", async () => {
    const { service, run } = makeService({}, S3_CONFIG);
    await expect(run(() => service.createImageUpload({ fileName: "a.gif", contentType: "image/gif", size: 1 }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a tenant-scoped signed upload URL", async () => {
    const { service, run } = makeService({}, S3_CONFIG);
    const result = await run(() => service.createImageUpload({ fileName: "Photo.JPG", contentType: "image/jpeg", size: 1 }));
    expect(result.key).toMatch(/^tenants\/tenant-1\/products\/[0-9a-f-]+\.jpg$/);
    expect(result).toMatchObject({ uploadUrl: "https://signed.example/upload", expiresIn: 300, publicUrl: `https://cdn.example/${result.key}` });
    const unsafe = await run(() => service.createImageUpload({ fileName: "evil.php", contentType: "image/png", size: 1 }));
    expect(unsafe.key).toMatch(/products\/[0-9a-f-]+$/);
  });

  it("requires tenant context to presign (no tenants/undefined keys)", async () => {
    const { service } = makeService({}, S3_CONFIG);
    await expect(service.createImageUpload({ fileName: "a.png", contentType: "image/png", size: 1 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("attaches an image only for this tenant's key and public URL", async () => {
    const prisma = {
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      productImage: { create: vi.fn().mockResolvedValue({ id: "i1" }) },
    };
    const { service, run } = makeService(prisma, S3_CONFIG);
    const key = "tenants/tenant-1/products/x.png";
    await expect(run(() => service.attachImage("p1", { key, url: `https://cdn.example/${key}`, alt: "Madu", position: 0 }))).resolves.toEqual({ id: "i1" });
    expect(prisma.productImage.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", productId: "p1", key, url: `https://cdn.example/${key}`, alt: "Madu", position: 0 },
    });
    await run(() => service.attachImage("p1", { key, url: `https://cdn.example/${key}` } as never));
    expect(prisma.productImage.create.mock.calls[1][0].data.position).toBe(0);
    await expect(run(() => service.attachImage("p1", { key: "tenants/tenant-2/products/x.png", url: `https://cdn.example/x`, position: 0 }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(() => service.attachImage("p1", { key, url: "https://evil.example/x", position: 0 }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attachImage("p1", { key, url: `https://cdn.example/${key}`, position: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("removes an image belonging to the product", async () => {
    const prisma = {
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      productImage: { findFirst: vi.fn().mockResolvedValueOnce({ id: "i1" }).mockResolvedValueOnce(null), delete: vi.fn() },
    };
    const { service } = makeService(prisma);
    await expect(service.removeImage("p1", "i1")).resolves.toEqual({ deleted: true });
    expect(prisma.productImage.findFirst).toHaveBeenCalledWith({ where: { id: "i1", productId: "p1" } });
    expect(prisma.productImage.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    await expect(service.removeImage("p1", "i2")).rejects.toBeInstanceOf(NotFoundException);
  });
});
