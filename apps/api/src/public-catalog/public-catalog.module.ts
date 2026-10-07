import { Module } from "@nestjs/common";
import { PublicCatalogController, StorefrontSettingsController } from "./public-catalog.controller";
import { PublicCatalogService } from "./public-catalog.service";

@Module({ controllers: [PublicCatalogController, StorefrontSettingsController], providers: [PublicCatalogService] })
export class PublicCatalogModule {}
