import { Controller, Get, Post, Body, UseGuards, Inject, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("status")
  async status(@Req() req: any) {
    const tenantId = req.user?.tenant?.id;
    if (!tenantId) return { error: "Tenant tidak ditemukan" };
    return this.billing.checkStatus(tenantId);
  }

  @Post("charge")
  async charge(@Req() req: any, @Body() body: { planCode: string; email?: string }) {
    const tenantId = req.user?.tenant?.id;
    const tenant = req.user?.tenant;
    if (!tenantId || !tenant) return { error: "Tenant tidak ditemukan" };
    if (!body.planCode) return { error: "planCode wajib" };

    return this.billing.chargeForPlan(tenantId, body.planCode, tenant);
  }

  @Post("webhook/midtrans")
  async midtransNotify(@Body() payload: Record<string, unknown>) {
    const result = await this.billing.handlePaymentNotification(payload);
    return { ok: result };
  }
}
