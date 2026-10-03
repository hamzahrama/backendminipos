import { describe, expect, it } from "vitest";
import { TenantContextService } from "./tenant-context.service";

describe("TenantContextService", () => {
  it("keeps tenant IDs isolated across concurrent asynchronous requests", async () => {
    const context = new TenantContextService();
    const [tenantA, tenantB] = await Promise.all([
      context.run("tenant-a", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return context.getTenantId();
      }),
      context.run("tenant-b", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return context.getTenantId();
      }),
    ]);

    expect(tenantA).toBe("tenant-a");
    expect(tenantB).toBe("tenant-b");
    expect(context.getTenantId()).toBeUndefined();
  });
});
