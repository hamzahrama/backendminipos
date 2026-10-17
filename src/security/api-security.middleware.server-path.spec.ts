import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ApiSecurityMiddleware } from "./api-security.middleware";

// Meniru request dari server asli: path relatif "/", originalUrl berisi jalur penuh.
function hit(middleware: ApiSecurityMiddleware, originalUrl: string, ip = "2.2.2.2") {
  const response = { code: 200, setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  response.status.mockImplementation((code: number) => {
    response.code = code;
    return response;
  });
  middleware.use(
    { path: "/", originalUrl, ip } as unknown as Request,
    response as unknown as Response,
    vi.fn() as unknown as NextFunction,
  );
  return response.code;
}

describe("ApiSecurityMiddleware dengan path relatif (perilaku server)", () => {
  it("membatasi login pada percobaan ke-11", () => {
    const middleware = new ApiSecurityMiddleware();
    for (let i = 1; i <= 10; i++) expect(hit(middleware, "/auth/login")).toBe(200);
    expect(hit(middleware, "/auth/login")).toBe(429);
  });

  it("menghitung login dengan query string sebagai rute yang sama", () => {
    const middleware = new ApiSecurityMiddleware();
    for (let i = 1; i <= 10; i++) hit(middleware, "/auth/login?a=1");
    expect(hit(middleware, "/auth/login")).toBe(429);
  });

  it("tidak berbagi keranjang antar rute", () => {
    const middleware = new ApiSecurityMiddleware();
    for (let i = 1; i <= 10; i++) hit(middleware, "/auth/login");
    expect(hit(middleware, "/public/catalog/slugs")).toBe(200);
  });
});
