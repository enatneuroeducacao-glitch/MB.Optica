import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type Payload = {
  month?: unknown;
  sales?: unknown;
  total?: unknown;
  notes?: unknown;
};

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);

    const rows = await db.legacyRecord.findMany({
      where: {
        source: "MANUAL_HISTORICO",
        collectionKey: "FATURAMENTO_MENSAL",
      },
      select: { id: true, payload: true, importedAt: true },
      orderBy: { importedAt: "asc" },
    });

    const entries = rows.map((row) => {
      const p = (row.payload || {}) as Payload;
      return {
        id: row.id,
        month: String(p.month || ""),
        sales: Math.max(0, Math.trunc(numberValue(p.sales))),
        total: Math.round(numberValue(p.total) * 100) / 100,
        notes: typeof p.notes === "string" ? p.notes : "",
        createdAt: row.importedAt,
      };
    }).filter((row) => validMonth(row.month));

    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return apiError(error, "Não foi possível carregar os lançamentos históricos manuais.");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN", "GERENTE"]);

    const body = (await request.json()) as Payload;
    const month = body.month;
    const sales = numberValue(body.sales);
    const total = numberValue(body.total);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!validMonth(month)) {
      return NextResponse.json({ ok: false, error: "Informe uma competência válida no formato AAAA-MM." }, { status: 400 });
    }
    if (!Number.isInteger(sales) || sales < 0) {
      return NextResponse.json({ ok: false, error: "A quantidade de vendas deve ser um número inteiro igual ou maior que zero." }, { status: 400 });
    }
    if (!Number.isFinite(total) || total < 0) {
      return NextResponse.json({ ok: false, error: "O faturamento deve ser um valor igual ou maior que zero." }, { status: 400 });
    }

    const legacyKey = "MANUAL_FATURAMENTO_MENSAL:" + month;
    const payload = { month, sales, total: Math.round(total * 100) / 100, notes };

    const existing = await db.legacyRecord.findUnique({ where: { legacyKey } });
    const record = existing
      ? await db.legacyRecord.update({
          where: { id: existing.id },
          data: { payload, status: "MANUAL", errorMessage: null },
          select: { id: true, payload: true, importedAt: true },
        })
      : await db.legacyRecord.create({
          data: {
            source: "MANUAL_HISTORICO",
            collectionKey: "FATURAMENTO_MENSAL",
            legacyId: month,
            legacyKey,
            payload,
            targetEntity: "HISTORICO_FATURAMENTO_MANUAL",
            status: "MANUAL",
          },
          select: { id: true, payload: true, importedAt: true },
        });

    return NextResponse.json({
      ok: true,
      message: existing ? "Lançamento histórico atualizado." : "Lançamento histórico registrado.",
      entry: record,
    });
  } catch (error) {
    return apiError(error, "Não foi possível registrar o faturamento histórico manual.");
  }
}
