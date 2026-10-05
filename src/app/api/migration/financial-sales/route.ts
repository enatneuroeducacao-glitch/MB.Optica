import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type Payload = Record<string, unknown>;

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function saleTotal(payload: Payload) {
  const values = payload.valoresIDs;
  const gross =
    values && typeof values === "object"
      ? Object.values(values as Record<string, unknown>).reduce(
          (sum: number, value: unknown) => sum + numberValue(value),
          0,
        )
      : numberValue(payload.valor ?? payload.total);

  return Math.max(0, gross - numberValue(payload.desconto));
}

function dateValue(value: unknown) {
  const n = numberValue(value);
  return n ? new Date(n).toISOString() : null;
}

function monthKey(dateValue: string | null) {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);

    const rows = await db.legacyRecord.findMany({
      where: { source: "BEEPSTART", collectionKey: "Venda" },
      select: { id: true, payload: true },
      orderBy: { id: "asc" },
    });

    const sales = rows
      .map((row) => {
        const p = (row.payload || {}) as Payload;
        const concluded = p.concluido !== false;
        const total = saleTotal(p);

        return {
          legacyRecordId: row.id,
          saleId: String(p.id ?? p.vendaID ?? p.codigo ?? row.id),
          date: dateValue(p.data),
          value: Math.round(total * 100) / 100,
          concluded,
        };
      })
      .filter((row) => row.concluded && row.value > 0)
      .sort((a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")),
      );

    const monthlyMap = new Map<
      string,
      { month: string; sales: number; total: number }
    >();

    for (const sale of sales) {
      const month = monthKey(sale.date);
      if (!month) continue;

      const current = monthlyMap.get(month) ?? {
        month,
        sales: 0,
        total: 0,
      };

      current.sales += 1;
      current.total += sale.value;
      monthlyMap.set(month, current);
    }

    const monthly = [...monthlyMap.values()]
      .map((row) => ({
        ...row,
        total: Math.round(row.total * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const total =
      Math.round(
        sales.reduce((sum, row) => sum + row.value, 0) * 100,
      ) / 100;

    return NextResponse.json({
      ok: true,
      source: "BEEPSTART",
      period: "2026",
      count: sales.length,
      total,
      monthly,
      sales,
      methodology:
        "Somente vendas concluídas com valor positivo. Canceladas ou não concluídas não entram na tabela.",
    });
  } catch (error) {
    return apiError(error, "Não foi possível carregar os valores faturados do legado.");
  }
}
