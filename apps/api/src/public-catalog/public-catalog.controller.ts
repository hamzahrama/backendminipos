import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { Public } from "../auth/public.decorator";
import { RequireRole } from "../auth/roles.decorator";
import { AuthenticatedRequest } from "../auth/auth.types";
import { PublicCatalogService } from "./public-catalog.service";

class PublicCatalogQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
}

class StorefrontSettingsDto {
  @IsOptional() @IsBoolean() publicCatalogEnabled?: boolean;
  @IsOptional() @IsBoolean() dailyReportEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(23) dailyReportHour?: number;
  @IsOptional() @IsString() @MaxLength(24)
  @Matches(/^\+?[0-9]{8,20}$/)
  whatsAppNumber?: string | null;
}

@Controller("public/catalog")
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Public()
  @Get("slugs")
  listSlugs() { return this.catalog.listEnabledSlugs(); }

  @Public()
  @Get(":slug")
  getCatalog(@Param("slug") slug: string, @Query() query: PublicCatalogQuery) {
    return this.catalog.getCatalog(slug, query);
  }

  @Public()
  @Get(":slug/products/:productId")
  getProduct(@Param("slug") slug: string, @Param("productId") productId: string) {
    return this.catalog.getProduct(slug, productId);
  }
}

@Controller("storefront/settings")
@RequireRole("owner")
export class StorefrontSettingsController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.catalog.getSettings(request.user.tenantId);
  }

  @Patch()
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: StorefrontSettingsDto) {
    return this.catalog.updateSettings(request.user.tenantId, body);
  }
}
