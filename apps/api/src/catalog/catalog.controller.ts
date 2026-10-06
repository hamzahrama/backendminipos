import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequireRole } from "../auth/roles.decorator";
import { AuthenticatedRequest } from "../auth/auth.types";
import {
  AttachImageDto,
  BulkPriceUpdateDto,
  CommitProductImportDto,
  CreateCategoryDto,
  CreateProductDto,
  ListProductsQueryDto,
  PresignImageDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";

@Controller()
@RequireRole("owner")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories") listCategories() { return this.catalog.listCategories(); }
  @Post("categories") createCategory(@Body() body: CreateCategoryDto) { return this.catalog.createCategory(body.name); }
  @Patch("categories/:id") updateCategory(@Param("id") id: string, @Body() body: UpdateCategoryDto) {
    return this.catalog.updateCategory(id, body.name!);
  }
  @Delete("categories/:id") deleteCategory(@Param("id") id: string) { return this.catalog.deleteCategory(id); }

  @Get("products") listProducts(@Query() query: ListProductsQueryDto) { return this.catalog.listProducts(query); }
  @Post("products/import/preview")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_048_576 } }))
  previewImport(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException("File CSV wajib diunggah.");
    return this.catalog.previewProductImport(file.buffer);
  }
  @Post("products/import/commit") commitImport(@Body() body: CommitProductImportDto) {
    return this.catalog.commitProductImport(body);
  }
  @Patch("products/bulk-prices") updatePrices(@Body() body: BulkPriceUpdateDto, @Req() request: AuthenticatedRequest) {
    return this.catalog.updatePrices(body, request.user.sub);
  }
  @Get("products/:id") getProduct(@Param("id") id: string) { return this.catalog.getProduct(id); }
  @Get("products/:id/price-history") getPriceHistory(@Param("id") id: string) { return this.catalog.getPriceHistory(id); }
  @Post("products") createProduct(@Body() body: CreateProductDto) { return this.catalog.createProduct(body); }
  @Patch("products/:id") updateProduct(@Param("id") id: string, @Body() body: UpdateProductDto, @Req() request: AuthenticatedRequest) {
    return this.catalog.updateProduct(id, body, request.user.sub);
  }
  @Delete("products/:id") deleteProduct(@Param("id") id: string) { return this.catalog.deleteProduct(id); }
  @Post("products/:id/restore") restoreProduct(@Param("id") id: string) { return this.catalog.restoreProduct(id); }

  @Post("products/images/presign") createImageUpload(@Body() body: PresignImageDto) {
    return this.catalog.createImageUpload(body);
  }
  @Post("products/:id/images") attachImage(@Param("id") id: string, @Body() body: AttachImageDto) {
    return this.catalog.attachImage(id, body);
  }
  @Delete("products/:id/images/:imageId") removeImage(@Param("id") id: string, @Param("imageId") imageId: string) {
    return this.catalog.removeImage(id, imageId);
  }
}
