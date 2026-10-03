import type { Request } from "express";

export type AuthIdentity = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  permissions: string[];
};

export type AccessTokenClaims = {
  sub: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[];
  permissions: string[];
  tokenType: "access";
};

export type RefreshTokenClaims = {
  sub: string;
  tenantId: string;
  familyId: string;
  tokenType: "refresh";
  jti: string;
};

export type AuthenticatedRequest = Request & {
  user: AccessTokenClaims;
  refreshTokenClaims?: RefreshTokenClaims;
};
