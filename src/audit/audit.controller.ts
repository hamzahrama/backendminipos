import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequireRole } from "../auth/roles.decorator";

@Controller("audit-logs")
@RequireRole("owner")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query("limit") rawLimit?: string) {
    const parsed = Number(rawLimit ?? 100);
    const take = Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 200)) : 100;
    return this.prisma.auditLog.findMany({
      take, orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, action: true, resource: true, createdAt: true },
    });
  }
}
