import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";
import { CatalogModule } from "./catalog/catalog.module";
import { ScheduleModule } from "@nestjs/schedule";
import { InventoryModule } from "./inventory/inventory.module";
import { AlertsModule } from "./alerts/alerts.module";

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), PrismaModule, AuthModule, CatalogModule, InventoryModule, AlertsModule], controllers: [AppController] })
export class AppModule {}
