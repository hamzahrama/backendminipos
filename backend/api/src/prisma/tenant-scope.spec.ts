import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { scopePrismaQuery } from "./tenant-scope";

describe("tenant Prisma query scope", () => {
  it("forces the authenticated tenant into filters and created records", () => {
    expect(
      scopePrismaQuery(
        "Role",
        "findMany",
        { where: { tenantId: "tenant-attacker", code: "owner" } },
        "tenant-current",
      ),
    ).toEqual({ where: { tenantId: "tenant-current", code: "owner" } });

    expect(
      scopePrismaQuery("RefreshToken", "create", { data: { userId: "user-1", tenantId: "other" } }, "tenant-current"),
    ).toEqual({ data: { userId: "user-1", tenantId: "tenant-current" } });
  });

  it("scopes user and role-permission queries through their tenant relation", () => {
    expect(scopePrismaQuery("User", "findMany", { where: { email: "a@example.com" } }, "tenant-current"))
      .toEqual({
        where: { email: "a@example.com", memberships: { some: { tenantId: "tenant-current" } } },
      });

    expect(scopePrismaQuery("RolePermission", "findMany", { where: { permissionId: "p1" } }, "tenant-current"))
      .toEqual({ where: { permissionId: "p1", role: { tenantId: "tenant-current" } } });
  });

  it("limits tenant queries to the tenant in the request context", () => {
    expect(scopePrismaQuery("Tenant", "findUnique", { where: { id: "tenant-other" } }, "tenant-current"))
      .toEqual({ where: { id: "tenant-current" } });
  });

  it("blocks tenant scoped edits to shared user and permission records", () => {
    expect(() => scopePrismaQuery("User", "update", { where: { id: "user-1" } }, "tenant-current"))
      .toThrow(ForbiddenException);
    expect(() => scopePrismaQuery("Permission", "deleteMany", {}, "tenant-current"))
      .toThrow(ForbiddenException);
  });
});
