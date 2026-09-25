import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  token: z.string().min(16).max(256),
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(160),
  password: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  try {
    const expected = process.env.AUTH_BOOTSTRAP_TOKEN;
    if (!expected || expected.length < 16) {
      return NextResponse.json({ error: "Bootstrap administrativo não configurado." }, { status: 503 });
    }

    const body = schema.parse(await request.json());
    if (body.token !== expected) return NextResponse.json({ error: "Token de inicialização inválido." }, { status: 403 });

    const count = await db.user.count();
    if (count > 0) return NextResponse.json({ error: "A inicialização administrativa já foi concluída." }, { status: 409 });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await db.user.create({
      data: { name: body.name, email: body.email.trim().toLowerCase(), role: "ADMIN", passwordHash },
    });
    await db.storeSettings.create({ data: { tradeName: "MB Óptica", state: "SC" } });
    await db.auditLog.create({ data: { action: "BOOTSTRAP_ADMIN", entity: "User", entityId: user.id, userId: user.id } });

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados de inicialização inválidos." }, { status: 422 });
    return NextResponse.json({ error: "Não foi possível criar o administrador." }, { status: 500 });
  }
}
