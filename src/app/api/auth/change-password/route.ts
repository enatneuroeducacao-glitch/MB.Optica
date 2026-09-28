import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, createSession, AUTH_COOKIE } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

const schema = z.object({
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await request.json());
    const passwordHash = await bcrypt.hash(body.password, 12);

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          sessionVersion: true,
          permissions: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "FIRST_ACCESS_PASSWORD_CHANGED",
          entity: "User",
          entityId: user.id,
          userId: user.id,
          metadata: { passwordChanged: true },
        },
      });

      return next;
    });

    const token = await createSession(updated);
    (await cookies()).set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        permissions: effectivePermissions(updated.role, updated.permissions),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, { status: 422 });
    }
    return apiError(error, "Não foi possível definir a nova senha.");
  }
}
