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
}

type EmailResult =
  | { ok: true; providerId?: string }
  | { ok: false; reason: "not_configured" | "provider_rejected" | "network_error"; status?: number; code?: string; message?: string };

function safeLogMessage(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[a-f0-9]{48,}/gi, "[token]")
    .slice(0, 300);
}

async function sendResetEmail(to: string, resetUrl: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
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
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? safeLogMessage(error.message) : "Falha de rede não identificada";
    console.error("[password-reset] Resend network error", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      message,
    });
    return { ok: false, reason: "network_error", message };
  }

  if (!response.ok) {
    let providerCode: string | undefined;
    let providerMessage: string | undefined;
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object") {
        const data = payload as Record<string, unknown>;
        providerCode = typeof data.name === "string" ? data.name : undefined;
        if (typeof data.statusCode === "number") providerCode ??= `status_${data.statusCode}`;
        providerMessage = safeLogMessage(data.message);
      }
    } catch {
      providerMessage = "O provedor retornou uma resposta não JSON.";
    }

    console.error("[password-reset] Resend rejected email", {
      httpStatus: response.status,
      providerCode,
      providerMessage,
    });
    return {
      ok: false,
      reason: "provider_rejected",
      status: response.status,
      code: providerCode,
      message: providerMessage,
    };
  }

  let providerId: string | undefined;
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "id" in payload && typeof payload.id === "string") {
      providerId = payload.id;
    }
  } catch {
    // A resposta 2xx já confirma a aceitação do envio; o ID é opcional.
  }
  return { ok: true, providerId };
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

    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM?.trim()) {
      console.error("[password-reset] Resend is not configured", {
        hasApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
        hasFrom: Boolean(process.env.RESEND_FROM?.trim()),
      });
      return NextResponse.json({ error: "A recuperação por e-mail ainda não está configurada no servidor." }, { status: 503 });
    }

    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const resetUrl = `${appUrl(request)}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const delivery = await sendResetEmail(user.email, resetUrl);

    if (!delivery.ok) {
      await db.passwordResetToken.deleteMany({ where: { tokenHash } });
      const status = delivery.reason === "not_configured" ? 503 : 502;
      return NextResponse.json(
        { error: status === 503 ? "A recuperação por e-mail ainda não está configurada no servidor." : "Não foi possível enviar o e-mail de recuperação." },
        { status },
      );
    }

    await db.auditLog.create({
      data: { action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: user.id },
    });

    return NextResponse.json({ ok: true, message: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 422 });
    }
    console.error("[password-reset] Request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? safeLogMessage(error.message) : "Erro não identificado",
    });
    return NextResponse.json({ error: "Não foi possível iniciar a recuperação de senha." }, { status: 500 });
  }
}
