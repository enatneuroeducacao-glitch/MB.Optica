import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type Payload = Record<string, unknown>;

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function saleTotal(payload: Payload) {
  const values = payload.valoresIDs;
  const gross = values && typeof values === "object"
    ? Object.values(values as Record<string, unknown>).reduce((sum, value) => sum + numberValue(value), 0)
    : numberValue(payload.valor ?? payload.total);
  return Math.max(0, gross - numberValue(payload.desconto));
}

function monthOf(timestamp: unknown) {
  const n = numberValue(timestamp);
  if (!n) return null;
  const date = new Date(n);
  const year = date.getUTCFullYear();
  if (year !== 2026) return null;
  return date.getUTCMonth();
}

function openReceivable(payload: Payload) {
  if (payload.archived === true) return 0;
  const value = numberValue(payload.valor);
  const installments = Array.isArray(payload.parcelas)
    ? (payload.parcelas as unknown[]).map(numberValue)
    : [];
  const paidCount = Array.isArray(payload.pagos) ? payload.pagos.length : 0;
  if (installments.length) {
    return Math.max(0, installments.slice(Math.min(paidCount, installments.length)).reduce((sum, value) => sum + value, 0));
  }
  return Math.max(0, value);
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);

    const rows = await db.legacyRecord.findMany({
      where: { source: "BEEPSTART" },
      select: { collectionKey:true, payload:true },
    });

    const months = MONTHS.map((name) => ({
      month:name,
      sales:0,
      billing:0,
      received:0,
      receivable:0,
      payable:0,
    }));

    let salesCount = 0;
    let billing = 0;
    let received = 0;
    let receivable = 0;
    let payable = 0;
    let payablePaid = 0;
    let receivableAccounts = 0;
    let payableAccounts = 0;

    for (const row of rows) {
      const p = (row.payload || {}) as Payload;
      const collection = String(row.collectionKey || "").toLowerCase();

      if (collection === "venda") {
        const month = monthOf(p.data);
        if (month !== null && p.concluido !== false) {
          const total = saleTotal(p);
          salesCount += 1;
          billing += total;
          months[month].sales += 1;
          months[month].billing += total;
        }
        continue;
      }

      if (collection === "movimentacao") {
        const value = numberValue(p.valor);
        const month = monthOf(p.data);
        if (value > 0 && month !== null) {
          received += value;
          months[month].received += value;
        }
        continue;
      }

      if (collection === "contaareceber") {
        const balance = openReceivable(p);
        if (balance > 0) {
          receivableAccounts += 1;
          receivable += balance;
          const month = monthOf(p.lancamento ?? p.data);
          if (month !== null) months[month].receivable += balance;
        }
        continue;
      }

      if (collection === "contaapagar") {
        const value = numberValue(p.valor);
        const paidCount = Array.isArray(p.pagos) ? p.pagos.length : 0;
        const installments = Array.isArray(p.parcelas)
          ? (p.parcelas as unknown[]).map(numberValue)
          : [];
        const open = p.archived === true
          ? 0
          : installments.length
            ? Math.max(0, installments.slice(Math.min(paidCount, installments.length)).reduce((sum, item) => sum + item, 0))
            : Math.max(0, value);
        if (value > 0) {
          payablePaid += Math.max(0, value - open);
          payableAccounts += 1;
        }
        payable += open;
        const month = monthOf(p.lancamento ?? p.data);
        if (month !== null) months[month].payable += open;
      }
    }

    const round = (n:number) => Math.round(n * 100) / 100;
    const normalized = months.map((m) => ({
      ...m,
      billing:round(m.billing),
      received:round(m.received),
      receivable:round(m.receivable),
      payable:round(m.payable),
    }));

    return NextResponse.json({
      ok:true,
      source:"BEEPSTART",
      period:"2026",
      archivedRecords:rows.length,
      salesCount,
      billing:round(billing),
      received:round(received),
      receivable:round(receivable),
      payable:round(payable),
      payablePaid:round(payablePaid),
      receivableAccounts,
      payableAccounts,
      months:normalized,
      methodology:{
        billing:"Venda concluída: soma de valores dos itens menos desconto.",
        received:"Entradas positivas registradas em Movimentacao.",
        receivable:"Saldo estimado das parcelas ainda não pagas em ContaAReceber; registros arquivados são tratados como quitados.",
        payable:"Saldo estimado das parcelas ainda não pagas em ContaAPagar.",
      }
    });
  } catch (error) {
    return apiError(error, "Não foi possível calcular o resumo financeiro do legado.");
  }
}
