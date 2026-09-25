import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { AUTH_COOKIE, getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    await db.auditLog.create({ data: { action: "LOGOUT", entity: "User", entityId: user.id, userId: user.id } });
  }
  (await cookies()).set(AUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
