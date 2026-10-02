import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({ email: z.string().trim().email().max(160) });

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(request: Request) {
  if (process.env.NODE_ENV === "production") return "https://gestao.mboptica.com.br";
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin.replace(/\/$/, "");
}port { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({ email: z.string().trim().email().max(160) });

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(request: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") return "https://gestao.mboptica.com.br";
  return new URL(request.url).origin.replace(/\/$/, "");
}
async function sendResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "MB Óptica — redefinição de senha",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#29251f;max-width:600px;margin:auto">
        <h2>Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir sua senha no MB Gestão Inteligente.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#a97838;color:#fff;text-decoration:none;border-radius:7px">Redefinir minha senha</a></p>
        <p>Este link expira em 30 minutos e pode ser usado uma única vez.</p>
        <p>Se você não solicitou a redefinição, ignore esta mensagem.</p>
      </div>`,
    }),
  });
  return response.ok;
}

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const normalizedEmail = email.toLowerCase();
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    // Resposta genérica evita revelar quais e-mails existem no sistema.
    if (!user || !user.active || !user.passwordHash) {
      return NextResponse.json({ ok: true, message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha." });
    }

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return NextResponse.json({ error: "A recuperação por e-mail ainda não está configurada no servidor." }, { status: 503 });
    }

    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const resetUrl = `${appUrl(request)}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const sent = await sendResetEmail(user.email, resetUrl);

    if (!sent) {
      await db.passwordResetToken.deleteMany({ where: { tokenHash: hashToken(token) } });
      return NextResponse.json({ error: "Não foi possível enviar o e-mail de recuperação." }, { status: 502 });
    }

    await db.auditLog.create({
      data: { action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: user.id },
    });

    return NextResponse.json({ ok: true, message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 422 });
    }
    return NextResponse.json({ error: "Não foi possível iniciar a recuperação de senha." }, { status: 500 });
  }
}
