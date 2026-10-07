import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiSecurityMiddleware } from "./api-security.middleware";

function fakeResponse() {
  const headers = new Map<string, unknown>();
  const response = {
    headers,
    setHeader: vi.fn((name: string, value: unknown) => { headers.set(name, value); return response; }),
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  };
  return response;
}

function call(middleware: ApiSecurityMiddleware, path: string, ip = "1.1.1.1") {
  const response = fakeResponse();
  const next = vi.fn();
  middleware.use({ path, ip } as unknown as Request, response as unknown as Response, next as unknown as NextFunction);
  return { response, next };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ApiSecurityMiddleware", () => {
  it("sets security headers and passes through", () => {
    vi.stubEnv("NODE_ENV", "test");
    const { response, next } = call(new ApiSecurityMiddleware(), "/catalog/products");
    expect(next).toHaveBeenCalledOnce();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(response.headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("adds HSTS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { response } = call(new ApiSecurityMiddleware(), "/");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("returns 429 with Retry-After after 10 login attempts per minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    const middleware = new ApiSecurityMiddleware();
    for (let i = 0; i < 10; i += 1) expect(call(middleware, "/auth/login").next).toHaveBeenCalled();
    vi.advanceTimersByTime(15_500);
    const { response, next } = call(middleware, "/auth/login");
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(response.headers.get("Retry-After")).toBe(45);
    // Other IPs and other auth families have separate buckets.
    expect(call(middleware, "/auth/login", "2.2.2.2").next).toHaveBeenCalled();
    expect(call(middleware, "/auth/refresh").next).toHaveBeenCalled();
    // The bucket resets after the window.
    vi.advanceTimersByTime(45_000);
    expect(call(middleware, "/auth/login").next).toHaveBeenCalled();
  });

  it("applies family limits: register 10, transactions 30, others 120", () => {
    const middleware = new ApiSecurityMiddleware();
    const countAllowed = (path: string) => {
      let allowed = 0;
      for (let i = 0; i < 200; i += 1) if (call(middleware, path).next.mock.calls.length) allowed += 1;
      return allowed;
    };
    expect(countAllowed("/auth/register-tenant")).toBe(10);
    expect(countAllowed("/transactions/abc")).toBe(30);
    expect(countAllowed("/reports/summary")).toBe(120);
  });

  it("groups sub-paths into one bucket and ignores query strings", () => {
    const middleware = new ApiSecurityMiddleware();
    for (let i = 0; i < 15; i += 1) call(middleware, `/transactions/${i}`);
    for (let i = 0; i < 15; i += 1) call(middleware, "/transactions?page=2");
    expect(call(middleware, "/transactions").response.status).toHaveBeenCalledWith(429);
  });

  it("periodically evicts expired buckets", () => {
    vi.useFakeTimers();
    const middleware = new ApiSecurityMiddleware();
    call(middleware, "/auth/login");
    const buckets = (middleware as unknown as { buckets: Map<string, unknown> }).buckets;
    expect(buckets.size).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(buckets.size).toBe(0);
  });
});
