import { Controller, Get, Post, Body, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("status")
  async status(@Req() req: unknown) {
    const user = (req as { user?: unknown }).user as Record<string, unknown> | undefined;
    const tenantId = (user?.tenant as { id?: string } | undefined)?.id;
    if (!tenantId) return { error: "Tenant tidak ditemukan" };
    return this.billing.checkStatus(tenantId);
  }

  @Post("charge")
  async charge(@Req() req: unknown, @Body() body: { planCode: string; email?: string }) {
    const user = (req as { user?: unknown }).user as Record<string, unknown> | undefined;
    const tenantId = (user?.tenant as { id?: string } | undefined)?.id;
    const tenant = user?.tenant as { slug: string; name: string } | undefined;
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
