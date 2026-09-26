import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { AUTH_COOKIE, createSession } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(3).max(200),
});


export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const identifier = body.email.toLowerCase();

    // TEMPORARY BUILD-PHASE ACCESS. Remove where: { email: identifier } });

    if (!user || !user.active || !user.passwordHash) {
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      await db.auditLog.create({ data: { action: "LOGIN_FAILED", entity: "User", entityId: user.id } });
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await createSession(user);
    (await cookies()).set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    await db.auditLog.create({ data: { action: "LOGIN", entity: "User", entityId: user.id, userId: user.id } });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados de acesso inválidos." }, { status: 422 });
    }
    return NextResponse.json({ error: "Não foi possível realizar o login." }, { status: 500 });
  }
}