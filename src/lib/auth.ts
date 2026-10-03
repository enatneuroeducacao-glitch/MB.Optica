import "server-only";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db } from "@/lib/db";
import { effectivePermissions } from "@/lib/permissions";

export const AUTH_COOKIE = "mb_optica_session";
const SESSION_HOURS = 12;

type SessionPayload = JWTPayload & { userId: string; role: string; version: number; permissions?: Record<string, boolean> };

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; role: string; sessionVersion: number; permissions?: unknown }) {
  const permissions = effectivePermissions(user.role, user.permissions);
  return new SignJWT({ userId: user.id, role: user.role, version: user.sessionVersion, permissions })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string) {
  const result = await jwtVerify<SessionPayload>(token, secretKey(), { algorithms: ["HS256"] });
  return result.payload;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;

  try {
    const payload = await verifySessionToken(token);
    if (!payload.userId || typeof payload.version !== "number") return null;
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, sessionVersion: true, permissions: true },
    });
    if (!user || !user.active || user.sessionVersion !== payload.version) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, mustChangePassword: user.mustChangePassword, permissions: effectivePermissions(user.role, user.permissions) };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function requirePermission(permission: string) {
  const user = await requireUser();
  if (user.permissions?.[permission] === false) throw new Error("FORBIDDEN");
  return user;
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function permissionAllowed(permissions: unknown, key: string) {
  if (!permissions || typeof permissions !== "object") return true;
  const value = (permissions as Record<string,unknown>)[key];
  return value !== false;
}
