import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { prisma } from "./db";

const COOKIE_NAME = "admin_token";
const TOKEN_EXPIRY = "7d";
const JWT_ISSUER = "iowagrants-admin";
const JWT_AUDIENCE = "iowagrants-web";

function getSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: {
  sub: string;
  email: string;
  tokenVersion: number;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(
  token: string,
): Promise<{ sub: string; email: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as { sub: string; email: string; tokenVersion: number };
  } catch {
    return null;
  }
}

export async function getAdminFromRequest(
  request: NextRequest,
): Promise<{ sub: string; email: string; tokenVersion: number } | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Verify the request is from an authenticated admin.
 * Throws UnauthorizedError if not — callers should catch
 * and return NextResponse.json({ error: "Unauthorized" }, { status: 401 }).
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<{ sub: string; email: string }> {
  const claims = await getAdminFromRequest(request);
  if (!claims) {
    throw new UnauthorizedError();
  }

  // Verify token version against DB to support revocation
  const admin = await prisma.adminUser.findUnique({ where: { id: claims.sub } });
  if (admin?.tokenVersion !== (claims.tokenVersion ?? 0)) {
    throw new UnauthorizedError();
  }

  return claims;
}


export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
