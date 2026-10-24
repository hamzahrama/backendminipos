import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OfflineService } from "./offline.service";

@Controller("offline")
@UseGuards(JwtAuthGuard)
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  @Get("snapshot")
  async getSnapshot(@Req() req: any) {
    const tenantId = req.user?.tenant?.id;
    if (!tenantId) return { error: "Tenant tidak ditemukan" };
    return this.offline.getProductSnapshot(tenantId);
  }
}
