import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken, safeEqual } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(12).max(200),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const configuredToken = process.env.BOOTSTRAP_TOKEN;
    if (!configuredToken || configuredToken.length < 32 || !safeEqual(body.token, configuredToken)) {
      return NextResponse.json({ error: "Token de inicialização inválido." }, { status: 401 });
    }

    const email = body.email.toLowerCase();
    const result = await db.$transaction(async (tx) => {
      const existingUsers = await tx.user.count();
      if (existingUsers > 0) throw new Error("BOOTSTRAP_ALREADY_INITIALIZED");

      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await tx.user.create({
        data: { name: body.name, email, passwordHash, role: "ADMIN", active: true },
      });

      const settings = await tx.storeSettings.create({
        data: { tradeName: "MB Óptica", state: "SC", active: true },
      });

      await tx.auditLog.create({
        data: {
          action: "SYSTEM_BOOTSTRAP",
          entity: "User",
          entityId: user.id,
          userId: user.id,
          metadata: { settingsId: settings.id, tokenFingerprint: hashToken(body.token).slice(0, 16) },
        },
      });

      return user;
    });

    return NextResponse.json({ ok: true, user: { id: result.id, name: result.name, email: result.email, role: result.role } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados de inicialização inválidos." }, { status: 422 });
    if (error instanceof Error && error.message === "BOOTSTRAP_ALREADY_INITIALIZED") {
      return NextResponse.json({ error: "O sistema já foi inicializado." }, { status: 409 });
    }
    return apiError(error, "Não foi possível inicializar o sistema.");
  }
}
