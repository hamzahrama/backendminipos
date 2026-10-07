import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";
import { CatalogModule } from "./catalog/catalog.module";
import { ScheduleModule } from "@nestjs/schedule";
import { InventoryModule } from "./inventory/inventory.module";
import { AlertsModule } from "./alerts/alerts.module";
import { CustomersModule } from "./customers/customers.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { VouchersModule } from "./vouchers/vouchers.module";
import { ReportsModule } from "./reports/reports.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { PublicCatalogModule } from "./public-catalog/public-catalog.module";
import { AuditInterceptor } from "./audit/audit.interceptor";
import { ApiSecurityMiddleware } from "./security/api-security.middleware";
import { AuditController } from "./audit/audit.controller";
import { BackupModule } from "./backups/backup.module";
import { WhatsAppModule } from "./whatsapp/whatsapp.module";
import { BonusModule } from "./bonus/bonus.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), PrismaModule, AuthModule, CatalogModule, InventoryModule, AlertsModule, CustomersModule, VouchersModule, TransactionsModule, ReportsModule, ExpensesModule, PublicCatalogModule, BackupModule, WhatsAppModule, BonusModule, AdminModule],
  controllers: [AppController, AuditController], providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(ApiSecurityMiddleware).forRoutes("*"); }
}
