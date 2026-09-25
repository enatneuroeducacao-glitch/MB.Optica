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

const TEST_EMAIL = "admin@mb-optica.local";

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const identifier = body.email.toLowerCase();

    // TEMPORARY BUILD-PHASE ACCESS. Remove before public/production handoff.
    let user = identifier === "admin" && body.password === "admin"
      ? await db.user.findUnique({ where: { email: TEST_EMAIL } })
      : await db.user.findUnique({ where: { email: identifier } });

    if (identifier === "admin" && body.password === "admin" && !user) {
      const passwordHash = await bcrypt.hash("admin", 12);
      user = await db.user.create({
        data: {
          name: "Administrador de Teste",
          email: TEST_EMAIL,
          passwordHash,
          role: "ADMIN",
          active: true,
        },
      });
      await db.auditLog.create({
        data: { action: "TEST_ADMIN_CREATED", entity: "User", entityId: user.id, userId: user.id },
      });
    }

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
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados de acesso inválidos." }, { status: 422 });
    }
    return NextResponse.json({ error: "Não foi possível realizar o login." }, { status: 500 });
  }
}