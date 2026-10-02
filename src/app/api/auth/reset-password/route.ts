import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(200),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const tokenHash = hashToken(body.token);
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || !record.user.active) {
      return NextResponse.json({ error: "Link de recuperação inválido ou expirado." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      }),
      db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      db.auditLog.create({
        data: { action: "PASSWORD_RESET", entity: "User", entityId: record.userId },
      }),
    ]);

    return NextResponse.json({ ok: true, message: "Senha redefinida com sucesso. Você já pode entrar no sistema." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres." }, { status: 422 });
    }
    return NextResponse.json({ error: "Não foi possível redefinir a senha." }, { status: 500 });
  }
}
