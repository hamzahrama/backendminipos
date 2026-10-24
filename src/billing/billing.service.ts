import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PLANS, planFor, buildSubscriptionInvoice, Plan, PlanCode } from "./plans";
import { MidtransService } from "../integrations/external.service";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransService,
  ) {}

  async getCurrentPlan(tenantId: string): Promise<Plan> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (!sub) return PLANS.FREE;
    return planFor(sub.planCode);
  }

  async checkStatus(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    if (!sub) {
      return {
        planCode: "FREE",
        plan: PLANS.FREE,
        status: "ACTIVE",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingDate: null,
        lastPaymentAt: null,
      };
    }
    const plan = planFor(sub.planCode);
    return {
      planCode: sub.planCode,
      plan,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      nextBillingDate: sub.nextBillingDate?.toISOString() ?? null,
      lastPaymentAt: sub.lastPaymentAt?.toISOString() ?? null,
    };
  }

  async initializeSubscription(tenantId: string, tenant: { slug: string }) {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planCode: "FREE",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      },
    });
  }

  async chargeForPlan(tenantId: string, planCode: string, tenant: { slug: string; name: string }): Promise<{ token: string | null; redirectUrl: string | null; error?: string; invoiceNumber: string }> {
    const plan = planFor(planCode);
    if (!plan || plan.priceRp <= 0) {
      return { token: null, redirectUrl: null, error: "Plan tidak valid atau gratis.", invoiceNumber: "" };
    }

    const ym = new Date().toISOString().slice(0, 7).replace("-", "");
    const counter = await this.prisma.$executeRawUnsafe(`
      SELECT seq FROM invoice_counters
      WHERE tenant_id = '${tenantId}' AND type = 'subscription'
      LIMIT 1
    `);
    const seq = (counter?.[0]?.seq ?? 0) + 1;
    const invoiceNumber = buildSubscriptionInvoice(tenant.slug, ym, seq);

    const orderId = `${invoiceNumber}-${Date.now()}`;
    const result = await this.midtrans.charge({
      orderId,
      grossAmount: plan.priceRp,
      customerEmail: "", // will be filled by frontend if available
    });

    if (!result.ok) {
      return { token: null, redirectUrl: null, error: result.error ?? "Charge gagal", invoiceNumber };
    }

    // Simpan pending payment
    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planCode: planCode as PlanCode,
        status: "ACTIVE",
        midtransOrderId: orderId,
        invoiceNumber,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        midtransOrderId: orderId,
        invoiceNumber,
        planCode: planCode as PlanCode,
      },
    });

    return { token: result.token, redirectUrl: result.redirectUrl, invoiceNumber };
  }

  async handlePaymentNotification(payload: Record<string, unknown>): Promise<boolean> {
    const orderId = payload.order_id as string;
    if (!orderId) return false;

    const transactionStatus = payload.transaction_status as string;
    const grossAmount = payload.gross_amount as number;

    // Find subscription by order ID
    const sub = await this.prisma.subscription.findFirst({
      where: { midtransOrderId: { contains: orderId } },
    });
    if (!sub) return false;

    if (transactionStatus === "settlement" || transactionStatus === "capture") {
      const now = new Date();
      const nextBilling = new Date(now);
      nextBilling.setMonth(nextBilling.getMonth() + 1);

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          lastPaymentAt: now,
          nextBillingDate: nextBilling,
          midtransOrderId: null, // Clear for next charge
        },
      });
      return true;
    } else if (transactionStatus === "cancel" || transactionStatus === "deny" || transactionStatus === "expire") {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "SUSPENDED" },
      });
      return true;
    }

    return false;
  }
}
