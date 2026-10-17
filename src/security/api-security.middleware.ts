import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

@Injectable()
export class ApiSecurityMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }, 60_000);

  constructor() { this.cleanup.unref(); }

  use(request: Request, response: Response, next: NextFunction) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    const pathname = (request.originalUrl ?? request.path).split("?")[0];
    const family = pathname.startsWith("/auth/") ? pathname.split("/").slice(0, 3).join("/") : `/${pathname.split("/")[1] ?? ""}`;
    const max = family === "/auth/login" || family === "/auth/register-tenant" ? 10 : family === "/transactions" ? 30 : 120;
    const key = `${request.ip}:${family}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) this.buckets.set(key, { count: 1, resetAt: now + 60_000 });
    else if (bucket.count >= max) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      response.status(429).json({ statusCode: 429, message: "Terlalu banyak permintaan. Coba lagi sebentar." });
      return;
    } else bucket.count += 1;
    next();
  }
}
