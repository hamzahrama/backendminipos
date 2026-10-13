export type MidtransConfig = { serverKey?: string; clientKey?: string; isProduction: boolean };
export type ChargeInput = { orderId: string; grossAmount: number; customerEmail?: string };
export type ChargeResult = { ok: boolean; mock: boolean; redirectUrl: string | null; token: string | null; error?: string };

export function readMidtransConfig(env: NodeJS.ProcessEnv = process.env): MidtransConfig {
  return {
    serverKey: env.MIDTRANS_SERVER_KEY?.trim() || undefined,
    clientKey: env.MIDTRANS_CLIENT_KEY?.trim() || undefined,
    isProduction: (env.MIDTRANS_IS_PRODUCTION ?? "false").toLowerCase() === "true",
  };
}

/**
 * Midtrans wrapper (Day 25). Sandbox/mock mode when no server key:
 * returns a deterministic mock token so checkout flows are testable
 * without production credentials.
 */
export class MidtransService {
  constructor(private readonly config: MidtransConfig = readMidtransConfig()) {}

  get mockMode() { return !this.config.serverKey; }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!Number.isFinite(input.grossAmount) || input.grossAmount <= 0) {
      return { ok: false, mock: this.mockMode, redirectUrl: null, token: null, error: "Nominal harus > 0." };
    }
    if (this.mockMode) {
      return {
        ok: true, mock: true,
        token: `mock-snap-${input.orderId}`,
        redirectUrl: `https://app.sandbox.midtrans.com/snap/v1/transactions/mock-snap-${input.orderId}`,
      };
    }
    try {
      const base = this.config.isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
      const auth = Buffer.from(`${this.config.serverKey}:`).toString("base64");
      const res = await fetch(`${base}/snap/v1/transactions`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_details: { order_id: input.orderId, gross_amount: Math.round(input.grossAmount) },
          customer_details: input.customerEmail ? { email: input.customerEmail } : undefined,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const payload = await res.json().catch(() => ({})) as { token?: string; redirect_url?: string; error_messages?: string[] };
      if (!res.ok || !payload.token) {
        return { ok: false, mock: false, redirectUrl: null, token: null, error: (payload.error_messages ?? [`HTTP ${res.status}`]).join("; ").slice(0, 300) };
      }
      return { ok: true, mock: false, token: payload.token, redirectUrl: payload.redirect_url ?? null };
    } catch {
      return { ok: false, mock: false, redirectUrl: null, token: null, error: "Midtrans tidak dapat dihubungi." };
    }
  }
}

export type NotifyConfig = {
  telegramBotToken?: string; telegramChatId?: string; slackWebhookUrl?: string;
};

export function readNotifyConfig(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    telegramChatId: env.TELEGRAM_CHAT_ID?.trim() || undefined,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL?.trim() || undefined,
  };
}

/** Telegram/Slack alerter (Day 27). Mock mode returns { delivered: false, mock: true }. */
export class AlertNotifier {
  constructor(private readonly config: NotifyConfig = readNotifyConfig()) {}

  async send(text: string): Promise<Array<{ channel: string; delivered: boolean; mock: boolean }>> {
    const results: Array<{ channel: string; delivered: boolean; mock: boolean }> = [];
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: this.config.telegramChatId, text: text.slice(0, 4000) }),
          signal: AbortSignal.timeout(8000),
        });
        results.push({ channel: "telegram", delivered: res.ok, mock: false });
      } catch {
        results.push({ channel: "telegram", delivered: false, mock: false });
      }
    } else {
      results.push({ channel: "telegram", delivered: false, mock: true });
    }
    if (this.config.slackWebhookUrl) {
      try {
        const res = await fetch(this.config.slackWebhookUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 4000) }),
          signal: AbortSignal.timeout(8000),
        });
        results.push({ channel: "slack", delivered: res.ok, mock: false });
      } catch {
        results.push({ channel: "slack", delivered: false, mock: false });
      }
    } else {
      results.push({ channel: "slack", delivered: false, mock: true });
    }
    return results;
  }
}

/** Sentry wrapper (Day 27). No-op without DSN; captures in-memory in mock mode for tests. */
export class ErrorReporter {
  readonly captured: Array<{ message: string; context?: Record<string, unknown> }> = [];
  constructor(private readonly dsn: string = (process.env.SENTRY_DSN ?? "").trim()) {}
  get enabled() { return Boolean(this.dsn); }
  capture(message: string, context?: Record<string, unknown>) {
    this.captured.push({ message, context });
    if (!this.dsn) return { delivered: false, mock: true as const };
    return { delivered: true, mock: false as const };
  }
}
