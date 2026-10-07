import { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AuditInterceptor } from "./audit.interceptor";

type FakeRequest = { method: string; route?: { path?: string }; baseUrl?: string; user?: { sub: string; tenantId: string } };

function setup(request: FakeRequest, create = vi.fn().mockResolvedValue({ id: "a-1" })) {
  const interceptor = new AuditInterceptor({ auditLog: { create } } as unknown as PrismaService);
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const handle = vi.fn(() => of({ ok: true }));
  const next = { handle } as unknown as CallHandler;
  return { interceptor, context, next, handle, create };
}

const user = { sub: "user-1", tenantId: "tenant-1" };

describe("AuditInterceptor", () => {
  it.each(["POST", "put", "PATCH", "DELETE"])("records %s mutations after the handler succeeds", async (method) => {
    const { interceptor, context, next, create } = setup({ method, baseUrl: "/vouchers", route: { path: "/:id" }, user });
    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", userId: "user-1", action: method.toUpperCase(), resource: "/vouchers/:id" },
      select: { id: true },
    });
  });

  it("skips reads and anonymous requests", async () => {
    for (const request of [{ method: "GET", user }, { method: "POST" }]) {
      const { interceptor, context, next, create } = setup(request);
      await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({ ok: true });
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("falls back to 'unknown' resource and truncates long paths", async () => {
    const first = setup({ method: "POST", user });
    await firstValueFrom(first.interceptor.intercept(first.context, first.next));
    expect(first.create.mock.calls[0][0].data.resource).toBe("unknown");

    const second = setup({ method: "POST", user, baseUrl: "/x", route: { path: "/".padEnd(400, "a") } });
    await firstValueFrom(second.interceptor.intercept(second.context, second.next));
    expect(second.create.mock.calls[0][0].data.resource).toHaveLength(180);
  });

  it("still returns the handler result when writing the audit log fails", async () => {
    const { interceptor, context, next } = setup({ method: "DELETE", user, baseUrl: "/expenses" }, vi.fn().mockRejectedValue(new Error("db")));
    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({ ok: true });
  });

  it("does not record failed mutations", async () => {
    const { interceptor, context, create } = setup({ method: "POST", user });
    const failing = { handle: () => throwError(() => new Error("bad request")) } as unknown as CallHandler;
    await expect(firstValueFrom(interceptor.intercept(context, failing))).rejects.toThrow("bad request");
    expect(create).not.toHaveBeenCalled();
  });
});
