import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const MODELS_WITH_TENANT_ID = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "tenantId"))
    .map((model) => model.name),
);

const READ_ACTIONS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);
const WHERE_ACTIONS = new Set([
  ...READ_ACTIONS,
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
]);
const CREATE_ACTIONS = new Set(["create", "createMany", "createManyAndReturn"]);
const WRITE_ACTIONS = new Set([
  ...CREATE_ACTIONS,
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

type QueryArgs = Record<string, unknown>;

function asQueryArgs(value: unknown): QueryArgs {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as QueryArgs)
    : {};
}

function mergeWhere(where: unknown, scope: QueryArgs): QueryArgs {
  return { ...asQueryArgs(where), ...scope };
}

function addTenantToData(data: unknown, tenantId: string) {
  if (Array.isArray(data)) {
    return data.map((record) => ({ ...asQueryArgs(record), tenantId }));
  }
  return { ...asQueryArgs(data), tenantId };
}

/** Adds the authenticated tenant constraint to one Prisma query. */
export function scopePrismaQuery(
  model: string,
  action: string,
  inputArgs: QueryArgs,
  tenantId: string,
): QueryArgs {
  const args = { ...inputArgs };

  if (MODELS_WITH_TENANT_ID.has(model)) {
    if (WHERE_ACTIONS.has(action)) args.where = mergeWhere(args.where, { tenantId });
    if (CREATE_ACTIONS.has(action)) args.data = addTenantToData(args.data, tenantId);
    if (action === "upsert") {
      args.where = mergeWhere(args.where, { tenantId });
      args.create = { ...asQueryArgs(args.create), tenantId };
      args.update = { ...asQueryArgs(args.update), tenantId };
    }
    return args;
  }

  if (model === "Tenant") {
    if (CREATE_ACTIONS.has(action) || action === "upsert") {
      throw new ForbiddenException("Tenant baru hanya dapat dibuat melalui registrasi.");
    }
    if (WHERE_ACTIONS.has(action)) args.where = mergeWhere(args.where, { id: tenantId });
    return args;
  }

  if (model === "User") {
    if (CREATE_ACTIONS.has(action) || action === "upsert") {
      throw new ForbiddenException("User harus ditambahkan melalui alur keanggotaan tenant.");
    }
    if (WHERE_ACTIONS.has(action)) {
      const where = asQueryArgs(args.where);
      const memberships = asQueryArgs(where.memberships);
      const some = asQueryArgs(memberships.some);
      args.where = {
        ...where,
        memberships: {
          ...memberships,
          some: { ...some, tenantId },
        },
      };
    }
    if (WRITE_ACTIONS.has(action)) {
      throw new ForbiddenException("User lintas tenant tidak dapat diubah melalui query tenant.");
    }
    return args;
  }

  if (model === "RolePermission") {
    if (WRITE_ACTIONS.has(action)) {
      throw new ForbiddenException("Permission role harus dikelola melalui role tenant.");
    }
    if (WHERE_ACTIONS.has(action)) {
      const where = asQueryArgs(args.where);
      args.where = {
        ...where,
        role: { ...asQueryArgs(where.role), tenantId },
      };
    }
    return args;
  }

  if (model === "Permission" && WRITE_ACTIONS.has(action)) {
    throw new ForbiddenException("Daftar permission bersifat global dan tidak dapat diubah tenant.");
  }

  return args;
}
