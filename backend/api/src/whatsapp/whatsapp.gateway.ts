export type WhatsAppProvider = "fonnte" | "wablas" | "disabled";

export type WhatsAppSendResult =
  | { ok: true; provider: WhatsAppProvider; providerMessageId: string | null; durationMs: number }
  | { ok: false; provider: WhatsAppProvider; error: string; durationMs: number };

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  token?: string;
  wablasBaseUrl?: string;
  timeoutMs: number;
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function readWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const raw = (env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase();
  const provider: WhatsAppProvider = raw === "fonnte" || raw === "wablas" ? raw : "disabled";
  const timeout = Number(env.WHATSAPP_TIMEOUT_MS ?? 5000);
  return {
    provider: env.WHATSAPP_TOKEN?.trim() ? provider : "disabled",
    token: env.WHATSAPP_TOKEN?.trim() || undefined,
    wablasBaseUrl: env.WABLAS_BASE_URL?.trim().replace(/\/+$/, "") || undefined,
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 && timeout <= 30000 ? timeout : 5000,
  };
}

/** Normalizes Indonesian phone numbers to the 62xxxxxxxxxx format used by WA gateways. */
export function normalizeWhatsAppNumber(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  let normalized = digits;
  if (normalized.startsWith("0")) normalized = `62${normalized.slice(1)}`;
  else if (normalized.startsWith("8")) normalized = `62${normalized}`;
  if (!/^628\d{7,12}$/.test(normalized)) return null;
  return normalized;
}

export class WhatsAppGateway {
  constructor(
    private readonly config: WhatsAppConfig = readWhatsAppConfig(),
    private readonly fetcher: FetchLike = (url, init) => fetch(url, init),
  ) {}

  get provider() { return this.config.provider; }
  get enabled() { return this.config.provider !== "disabled"; }

  async send(phone: string, message: string): Promise<WhatsAppSendResult> {
    const started = Date.now();
    const provider = this.config.provider;
    if (provider === "disabled" || !this.config.token) {
      return { ok: false, provider, error: "Gateway WhatsApp belum dikonfigurasi (WHATSAPP_PROVIDER dan WHATSAPP_TOKEN).", durationMs: 0 };
    }
    try {
      const signal = AbortSignal.timeout(this.config.timeoutMs);
      let response: Response;
      if (provider === "fonnte") {
        const body = new URLSearchParams({ target: phone, message, countryCode: "62" });
        response = await this.fetcher("https://api.fonnte.com/send", {
          method: "POST", headers: { Authorization: this.config.token }, body, signal,
        });
      } else {
        if (!this.config.wablasBaseUrl) {
          return { ok: false, provider, error: "WABLAS_BASE_URL wajib diisi untuk provider Wablas.", durationMs: 0 };
        }
        response = await this.fetcher(`${this.config.wablasBaseUrl}/api/send-message`, {
          method: "POST", headers: { Authorization: this.config.token, "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message }), signal,
        });
      }
      const durationMs = Date.now() - started;
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      const accepted = response.ok && payload.status !== false;
      if (!accepted) {
        const reason = typeof payload.reason === "string" ? payload.reason : typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`;
        return { ok: false, provider, error: reason.slice(0, 300), durationMs };
      }
      return { ok: true, provider, providerMessageId: extractMessageId(payload), durationMs };
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        ok: false, provider, durationMs: Date.now() - started,
        error: timedOut ? `Gateway tidak merespons dalam ${this.config.timeoutMs} ms.` : "Gateway WhatsApp tidak dapat dihubungi.",
      };
    }
  }
}

function extractMessageId(payload: Record<string, unknown>): string | null {
  const id = payload.id;
  if (Array.isArray(id) && id.length) return String(id[0]).slice(0, 120);
  if (typeof id === "string" || typeof id === "number") return String(id).slice(0, 120);
  const data = payload.data as { messages?: Array<{ id?: string }> } | undefined;
  const nested = data?.messages?.[0]?.id;
  return nested ? String(nested).slice(0, 120) : null;
}
