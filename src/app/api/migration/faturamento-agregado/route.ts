import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type MonthRow = { mes: string; faturamento: number };
type AggregatePayload = {
  schema?: string;
  origem?: string;
  granularidade?: string;
  somente_agregados?: boolean;
  inclui_registros_individuais_de_venda?: boolean;
  mensal?: MonthRow[];
  resumo?: { faturamento_total_reconhecido?: number; quantidade_meses?: number };
  arquivo_origem?: string;
};

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const validMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);
    const rows = await db.legacyRecord.findMany({
      where: { source: "BEEPSTART_AGREGADO", collectionKey: "FATURAMENTO_MENSAL" },
      select: { legacyId: true, payload: true, importedAt: true },
      orderBy: { legacyId: "asc" },
    });
    const mensal = rows.map((r) => {
      const p = (r.payload || {}) as Record<string, unknown>;
      return { mes: String(p.month || r.legacyId || ""), faturamento: roundMoney(Number(p.total || 0)), importedAt: r.importedAt };
    });
    return NextResponse.json({ ok: true, mensal, total: roundMoney(mensal.reduce((sum, r) => sum + r.faturamento, 0)) });
  } catch (error) {
    return apiError(error, "Não foi possível consultar o faturamento histórico agregado.");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = (await request.json()) as AggregatePayload;
    if (body.schema !== "mb-gestao.faturamento-agregado.v1" ||
        body.origem !== "BEEPSTART" ||
        body.granularidade !== "mensal" ||
        body.somente_agregados !== true ||
        body.inclui_registros_individuais_de_venda !== false) {
      return NextResponse.json({ ok: false, error: "Formato não reconhecido. Envie o JSON de faturamento agregado mensal, não o backup completo do C1." }, { status: 400 });
    }
    if (!Array.isArray(body.mensal) || body.mensal.length < 1 || body.mensal.length > 120) {
      return NextResponse.json({ ok: false, error: "A lista mensal deve conter entre 1 e 120 competências." }, { status: 400 });
    }
    const seen = new Set<string>();
    const rows: Array<{ month: string; total: number }> = [];
    for (const item of body.mensal) {
      if (!item || !validMonth(item.mes)) return NextResponse.json({ ok: false, error: "Existe uma competência inválida. Use AAAA-MM." }, { status: 400 });
      if (seen.has(item.mes)) return NextResponse.json({ ok: false, error: "O arquivo contém competências duplicadas: " + item.mes }, { status: 400 });
      seen.add(item.mes);
      const total = Number(item.faturamento);
      if (!Number.isFinite(total) || total < 0 || !Number.isSafeInteger(Math.round(total * 100))) {
        return NextResponse.json({ ok: false, error: "Valor inválido na competência " + item.mes }, { status: 400 });
      }
      rows.push({ month: item.mes, total: roundMoney(total) });
    }
    rows.sort((a, b) => a.month.localeCompare(b.month));
    const computedTotal = roundMoney(rows.reduce((sum, r) => sum + r.total, 0));
    const declaredTotal = Number(body.resumo?.faturamento_total_reconhecido);
    if (!Number.isFinite(declaredTotal) || Math.abs(roundMoney(declaredTotal) - computedTotal) > 0.01) {
      return NextResponse.json({ ok: false, error: "O total do resumo não confere com a soma dos meses. Importação bloqueada." }, { status: 400 });
    }
    if (body.resumo?.quantidade_meses !== undefined && Number(body.resumo.quantidade_meses) !== rows.length) {
      return NextResponse.json({ ok: false, error: "A quantidade de meses declarada não confere com a lista mensal." }, { status: 400 });
    }

    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ origem: body.origem, rows })).digest("hex");
    const legacyKeys = rows.map((r) => "BEEPSTART_AGREGADO_FATURAMENTO:" + r.month);
    const existing = await db.legacyRecord.findMany({
      where: { legacyKey: { in: legacyKeys } },
      select: { legacyKey: true, payload: true },
    });
    const byKey = new Map(existing.map((r) => [r.legacyKey, r]));
    const conflicts = rows.filter((r) => {
      const old = byKey.get("BEEPSTART_AGREGADO_FATURAMENTO:" + r.month);
      if (!old) return false;
      const p = (old.payload || {}) as Record<string, unknown>;
      return roundMoney(Number(p.total || 0)) !== r.total;
    });
    if (conflicts.length) {
      return NextResponse.json({ ok: false, error: "Já existe faturamento histórico diferente para: " + conflicts.map((r) => r.month).join(", ") + ". Nenhum dado foi alterado; revise antes de substituir." }, { status: 409 });
    }

    const pending = rows.filter((r) => !byKey.has("BEEPSTART_AGREGADO_FATURAMENTO:" + r.month));
    if (pending.length) {
      await db.$transaction(pending.map((r) => db.legacyRecord.create({
        data: {
          source: "BEEPSTART_AGREGADO",
          collectionKey: "FATURAMENTO_MENSAL",
          legacyId: r.month,
          legacyKey: "BEEPSTART_AGREGADO_FATURAMENTO:" + r.month,
          payload: { month: r.month, total: r.total, origin: "BEEPSTART", sourceFile: body.arquivo_origem || null, aggregateFingerprint: fingerprint },
          targetEntity: "HISTORICO_FATURAMENTO_MENSAL",
          status: "IMPORTED",
        },
      })));
    }

    return NextResponse.json({
      ok: true,
      message: pending.length ? "Faturamento mensal histórico importado." : "Este faturamento já estava integrado; nenhum registro duplicado foi criado.",
      importedMonths: pending.length,
      alreadyPresentMonths: rows.length - pending.length,
      months: rows.length,
      total: computedTotal,
      fingerprint,
      safety: { salesCreated: false, customersChanged: false, productsChanged: false, stockChanged: false, cashChanged: false, individualPaymentsCreated: false, accountingEntriesCreated: false },
    });
  } catch (error) {
    return apiError(error, "Não foi possível importar o faturamento agregado mensal.");
  }
}
