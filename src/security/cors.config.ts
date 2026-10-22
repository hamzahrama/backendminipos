import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export function buildCorsOptions(
  corsOrigins: string = process.env.CORS_ORIGINS ?? "http://localhost:3000",
): CorsOptions {
  const allowedOrigins = corsOrigins.split(",").map((origin) => origin.trim()).filter(Boolean);
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin tidak diizinkan."), false);
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id", "Idempotency-Key"],
    maxAge: 600,
  };
}
