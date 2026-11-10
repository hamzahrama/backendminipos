import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OfflineService } from "./offline.service";

@Controller("offline")
@UseGuards(JwtAuthGuard)
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  @Get("snapshot")
  async getSnapshot(@Req() req: unknown) {
    const user = (req as { user?: unknown }).user as Record<string, unknown> | undefined;
    const tenantId = (user?.tenantId as string | undefined) || (user?.tenant as { id?: string } | undefined)?.id;
    if (!tenantId) return { error: "Tenant tidak ditemukan" };
    return this.offline.getProductSnapshot(tenantId);
  }
}
