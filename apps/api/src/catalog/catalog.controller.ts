import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { RequireRole } from "../auth/roles.decorator";
import {
  AttachImageDto,
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
  @Get("products/:id") getProduct(@Param("id") id: string) { return this.catalog.getProduct(id); }
  @Post("products") createProduct(@Body() body: CreateProductDto) { return this.catalog.createProduct(body); }
  @Patch("products/:id") updateProduct(@Param("id") id: string, @Body() body: UpdateProductDto) {
    return this.catalog.updateProduct(id, body);
  }
  @Delete("products/:id") deleteProduct(@Param("id") id: string) { return this.catalog.deleteProduct(id); }

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
