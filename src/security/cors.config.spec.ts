import { describe, expect, it } from "vitest";
import { buildCorsOptions } from "./cors.config";

type OriginResult = { error: Error | null; allow?: unknown };

function checkOrigin(origin: string | undefined, corsOrigins = "http://localhost:3000"): OriginResult {
  const decide = buildCorsOptions(corsOrigins).origin as (
    requestOrigin: string | undefined,
    callback: (error: Error | null, allow?: unknown) => void,
  ) => void;
  let result: OriginResult = { error: null };
  decide(origin, (error, allow) => {
    result = { error, allow };
  });
  return result;
}

describe("buildCorsOptions", () => {
  it("mengizinkan semua header yang dikirim frontend, termasuk Idempotency-Key", () => {
    const allowed = (buildCorsOptions("http://localhost:3000").allowedHeaders as string[]).map((h) =>
      h.toLowerCase(),
    );
    for (const name of ["content-type", "authorization", "x-tenant-id", "idempotency-key"]) {
      expect(allowed).toContain(name);
    }
  });

  it("mengizinkan metode POST dan OPTIONS", () => {
    const methods = buildCorsOptions("http://localhost:3000").methods as string[];
    expect(methods).toContain("POST");
    expect(methods).toContain("OPTIONS");
  });

  it("mengizinkan asal yang terdaftar", () => {
    expect(checkOrigin("http://localhost:3000")).toEqual({ error: null, allow: true });
  });

  it("mengizinkan permintaan tanpa Origin (misalnya curl atau server ke server)", () => {
    expect(checkOrigin(undefined)).toEqual({ error: null, allow: true });
  });

  it("menolak asal yang tidak terdaftar", () => {
    const result = checkOrigin("http://evil.example");
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe("Origin tidak diizinkan.");
    expect(result.allow).toBe(false);
  });

  it("membaca banyak asal dari CORS_ORIGINS dan mengabaikan spasi", () => {
    const config = "http://localhost:3000, https://pos.example.com";
    expect(checkOrigin("https://pos.example.com", config)).toEqual({ error: null, allow: true });
  });
});
