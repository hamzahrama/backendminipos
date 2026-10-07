import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { LoginDto } from "./dto/login.dto";
import { RegisterTenantDto } from "./dto/register-tenant.dto";
import {
  AccessTokenClaims,
  AuthIdentity,
  RefreshTokenClaims,
} from "./auth.types";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const TENANT_STATUS_CACHE_MS = 30_000;
export const SUSPENDED_MESSAGE = "Toko ini sedang ditangguhkan. Hubungi admin platform.";

/** Platform super admins are configured by email, independent of tenant roles. */
export function isSuperAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env) {
  const list = (env.SUPER_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERMISSIONS = [
  { code: "dashboard:read", description: "Melihat dashboard" },
  { code: "products:manage", description: "Mengelola produk" },
  { code: "sales:create", description: "Membuat transaksi penjualan" },
  { code: "customers:read", description: "Melihat data pelanggan" },
  { code: "reports:read", description: "Melihat laporan" },
  { code: "team:manage", description: "Mengelola anggota toko" },
] as const;

const ROLE_DEFINITIONS = [
  {
    code: "owner",
    name: "Pemilik",
    permissions: PERMISSIONS.map(({ code }) => code),
  },
  {
    code: "cashier",
    name: "Kasir",
    permissions: ["dashboard:read", "sales:create", "customers:read"],
  },
  {
    code: "agent",
    name: "Agen",
    permissions: ["dashboard:read", "customers:read"],
  },
] as const;

type MembershipWithDetails = Prisma.UserTenantGetPayload<{
  include: {
    user: true;
    tenant: true;
    role: { include: { permissions: { include: { permission: true } } } };
  };
}>;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  familyId: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
};

@Injectable()
export class AuthService {
  private readonly tenantStatusCache = new Map<string, { status: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async registerTenant(dto: RegisterTenantDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hash(dto.password, 12);

    try {
      const identity = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.tenantName.trim(),
            slug: await this.createTenantSlug(dto.tenantName, tx),
          },
        });

        const permissionRecords = await Promise.all(
          PERMISSIONS.map((permission) =>
            tx.permission.upsert({
              where: { code: permission.code },
              update: {},
              create: permission,
            }),
          ),
        );
        const permissionIds = new Map(
          permissionRecords.map((permission) => [permission.code, permission.id]),
        );

        let ownerRole: Role | undefined;
        for (const definition of ROLE_DEFINITIONS) {
          const role = await tx.role.create({
            data: {
              tenantId: tenant.id,
              code: definition.code,
              name: definition.name,
            },
          });

          await tx.rolePermission.createMany({
            data: definition.permissions.map((code) => ({
              roleId: role.id,
              permissionId: permissionIds.get(code)!,
            })),
          });

          if (definition.code === "owner") ownerRole = role;
        }

        const user = await tx.user.create({
          data: {
            name: dto.ownerName.trim(),
            email,
            passwordHash,
          },
        });

        if (!ownerRole) throw new Error("Role owner tidak berhasil dibuat.");

        await tx.userTenant.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            roleId: ownerRole.id,
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          roles: [ownerRole.code],
          permissions: [...ROLE_DEFINITIONS[0].permissions],
        } satisfies AuthIdentity;
      });

      return this.createSession(identity);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email atau slug toko sudah digunakan.");
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const membership = await this.prisma.userTenant.findFirst({
      where: {
        user: { email: dto.email.trim().toLowerCase() },
        tenant: { slug: dto.tenantSlug.trim().toLowerCase() },
      },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    const passwordIsValid = membership
      ? await compare(dto.password, membership.user.passwordHash)
      : false;
    if (!membership || !passwordIsValid) {
      throw new UnauthorizedException("Email, password, atau nama toko tidak sesuai.");
    }
    this.assertMembershipTenantActive(membership);

    return this.createSession(this.toIdentity(membership));
  }

  async getProfile(accessClaims: AccessTokenClaims) {
    const membership = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: accessClaims.sub,
          tenantId: accessClaims.tenantId,
        },
      },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!membership) throw new UnauthorizedException("Keanggotaan tenant sudah tidak tersedia.");

    const identity = this.toIdentity(membership);
    return {
      userId: identity.id,
      email: identity.email,
      tenantId: identity.tenantId,
      tenantSlug: identity.tenantSlug,
      roles: identity.roles,
    };
  }

  async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenClaims> {
    let claims: RefreshTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshTokenClaims>(refreshToken, {
        secret: this.getSecret("REFRESH_TOKEN_SECRET", "hni-pos-local-refresh-secret-change-me"),
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthorizedException("Refresh token tidak valid atau sudah kedaluwarsa.");
    }

    if (
      claims.tokenType !== "refresh" ||
      !claims.familyId ||
      !claims.sub ||
      !claims.tenantId ||
      !claims.jti
    ) {
      throw new UnauthorizedException("Refresh token tidak valid.");
    }
    return claims;
  }

  async refresh(refreshToken: string, verifiedClaims?: RefreshTokenClaims) {
    const claims = verifiedClaims ?? (await this.verifyRefreshToken(refreshToken));

    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !storedToken ||
      storedToken.userId !== claims.sub ||
      storedToken.tenantId !== claims.tenantId ||
      storedToken.familyId !== claims.familyId ||
      storedToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("Refresh token tidak valid atau sudah kedaluwarsa.");
    }

    if (storedToken.revokedAt) {
      await this.revokeTokenFamily(storedToken.familyId);
      throw new UnauthorizedException("Refresh token sudah digunakan. Silakan login kembali.");
    }

    const membership = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: storedToken.userId, tenantId: storedToken.tenantId } },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!membership) throw new UnauthorizedException("Akses toko sudah tidak tersedia.");
    this.assertMembershipTenantActive(membership);

    const identity = this.toIdentity(membership);
    const tokens = await this.buildTokenPair(identity, storedToken.familyId);
    const rotated = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (consumed.count !== 1) return false;

      await tx.refreshToken.create({
        data: {
          userId: identity.id,
          tenantId: identity.tenantId,
          tokenHash: tokens.refreshTokenHash,
          familyId: storedToken.familyId,
          expiresAt: tokens.refreshTokenExpiresAt,
        },
      });
      return true;
    });

    if (!rotated) {
      await this.revokeTokenFamily(storedToken.familyId);
      throw new UnauthorizedException("Refresh token sudah digunakan. Silakan login kembali.");
    }

    return this.toAuthResponse(identity, tokens);
  }

  async logout(refreshToken: string, accessClaims: AccessTokenClaims) {
    const refreshClaims = await this.verifyRefreshToken(refreshToken);
    if (refreshClaims.sub !== accessClaims.sub || refreshClaims.tenantId !== accessClaims.tenantId) {
      throw new UnauthorizedException("Refresh token bukan milik session ini.");
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        familyId: refreshClaims.familyId,
        userId: refreshClaims.sub,
        tenantId: refreshClaims.tenantId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { status: "ok" };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.getSecret("ACCESS_TOKEN_SECRET", "hni-pos-local-access-secret-change-me"),
        algorithms: ["HS256"],
      });

      if (claims.tokenType !== "access" || !claims.sub || !claims.tenantId) {
        throw new UnauthorizedException("Token akses tidak valid.");
      }

      return claims;
    } catch {
      throw new UnauthorizedException("Token akses tidak valid atau sudah kedaluwarsa.");
    }
  }

  /** Rejects requests for suspended tenants (cached briefly); super admins keep access to their own store. */
  async assertTenantActive(claims: AccessTokenClaims) {
    if (claims.roles.includes("super_admin")) return;
    const now = Date.now();
    let cached = this.tenantStatusCache.get(claims.tenantId);
    if (!cached || cached.expiresAt <= now) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: claims.tenantId }, select: { status: true } });
      if (!tenant) throw new UnauthorizedException("Toko tidak ditemukan.");
      cached = { status: tenant.status, expiresAt: now + TENANT_STATUS_CACHE_MS };
      this.tenantStatusCache.set(claims.tenantId, cached);
    }
    if (cached.status !== "ACTIVE") throw new ForbiddenException(SUSPENDED_MESSAGE);
  }

  invalidateTenantStatus(tenantId: string) {
    this.tenantStatusCache.delete(tenantId);
  }

  private assertMembershipTenantActive(membership: { tenant: { status?: string }; user: { email: string } }) {
    if (membership.tenant.status && membership.tenant.status !== "ACTIVE" && !isSuperAdminEmail(membership.user.email)) {
      throw new ForbiddenException(SUSPENDED_MESSAGE);
    }
  }

  private async createTenantSlug(name: string, tx: Prisma.TransactionClient) {
    const baseSlug =
      name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "toko";

    const slugExists = await tx.tenant.findUnique({ where: { slug: baseSlug }, select: { id: true } });
    return slugExists ? `${baseSlug}-${randomBytes(3).toString("hex")}` : baseSlug;
  }

  private toIdentity(membership: MembershipWithDetails): AuthIdentity {
    return {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantSlug: membership.tenant.slug,
      roles: isSuperAdminEmail(membership.user.email) ? [membership.role.code, "super_admin"] : [membership.role.code],
      permissions: membership.role.permissions.map(({ permission }) => permission.code),
    };
  }

  private async createSession(identity: AuthIdentity) {
    const tokens = await this.buildTokenPair(identity, randomUUID());
    await this.prisma.refreshToken.create({
      data: {
        userId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: tokens.refreshTokenHash,
        familyId: tokens.familyId,
        expiresAt: tokens.refreshTokenExpiresAt,
      },
    });
    return this.toAuthResponse(identity, tokens);
  }

  private async buildTokenPair(identity: AuthIdentity, familyId: string): Promise<TokenPair> {
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        {
          sub: identity.id,
          email: identity.email,
          tenantId: identity.tenantId,
          tenantSlug: identity.tenantSlug,
          roles: identity.roles,
          permissions: identity.permissions,
          tokenType: "access",
        },
        {
          secret: this.getSecret("ACCESS_TOKEN_SECRET", "hni-pos-local-access-secret-change-me"),
          algorithm: "HS256",
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
      ),
      this.jwt.signAsync(
        {
          sub: identity.id,
          tenantId: identity.tenantId,
          familyId,
          tokenType: "refresh",
          jti: randomUUID(),
        },
        {
          secret: this.getSecret("REFRESH_TOKEN_SECRET", "hni-pos-local-refresh-secret-change-me"),
          algorithm: "HS256",
          expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      familyId,
      refreshTokenHash: this.hashToken(refreshToken),
      refreshTokenExpiresAt,
    };
  }

  private toAuthResponse(identity: AuthIdentity, tokens: TokenPair) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        tenant: {
          id: identity.tenantId,
          name: identity.tenantName,
          slug: identity.tenantSlug,
        },
        roles: identity.roles,
        permissions: identity.permissions,
      },
    };
  }

  private async revokeTokenFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private getSecret(name: "ACCESS_TOKEN_SECRET" | "REFRESH_TOKEN_SECRET", developmentValue: string) {
    const configuredValue = process.env[name];
    if (configuredValue && configuredValue.length < 32) {
      throw new Error(`${name} harus memiliki panjang minimal 32 karakter.`);
    }
    if (configuredValue) return configuredValue;
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${name} wajib diatur saat NODE_ENV=production.`);
    }
    return developmentValue;
  }
}
