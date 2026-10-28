import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenant/tenant-context.service";
import { scopePrismaQuery } from "./tenant-scope";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    this.$use(async (params, next) => {
      const tenantId = this.tenantContext.getTenantId();
      if (!tenantId) return next(params);
      if (!params.model) {
        if (["queryRaw", "queryRawUnsafe", "executeRaw", "executeRawUnsafe"].includes(params.action)) {
          throw new ForbiddenException("Raw SQL tidak diizinkan pada request tenant-scoped.");
        }
        return next(params);
      }

      return next({
        ...params,
        args: scopePrismaQuery(params.model, params.action, params.args ?? {}, tenantId),
      });
    });
    
    // Lazy connect: only connect on first query, not at bootstrap
    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB connection timeout")), 5000))
      ]);
    } catch (err) {
      console.warn("Prisma connection deferred (will retry on first query):", (err as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
