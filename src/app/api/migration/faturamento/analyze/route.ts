import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type R = Record<string, unknown>;

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const numberValue = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const dateValue = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && raw.length >= 10) {
    const d = new Date(numeric);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const first = (r: R, keys: string[]) => {
  for (const key of keys) {
    if (r[key] !== undefined && r[key] !== null && String(r[key]).trim() !== "") return r[key];
  }
  return null;
};

const saleTotal = (p: R) => {
  const values = p.valoresIDs;
  const gross =
    values && typeof values === "object" && !Array.isArray(values)
      ? Object.values(values as Record<string, unknown>).reduce((sum, value) => sum + numberValue(value), 0)
      : numberValue(first(p, ["valor", "total", "valorTotal"]));
  return Math.max(0, gross - numberValue(first(p, ["desconto", "discount"])));
};

const financialCollections = [
  {
    key: "venda",
    label: "Vendas",
    score: 100,
    reason: "Coleção financeira principal: possui data, valores e estado de conclusão."
  },
  {
    key: "movimentacao",
    label: "Movimentações / recebimentos",
    score: 100,
    reason: "Coleção usada pelo resumo financeiro existente para entradas e recebimentos."
  },
  {
    key: "contaareceber",
    label: "Contas a receber",
    score: 100,
    reason: "Coleção usada pelo resumo financeiro existente para parcelas e saldos de clientes."
  },
  {
    key: "contaapagar",
    label: "Contas a pagar",
    score: 100,
    reason: "Coleção usada pelo resumo financeiro existente para despesas e parcelas."
  },
];

const possibleFinancial = new Set([
  "venda",
  "movimentacao",
  "contaareceber",
  "contaapagar",
  "pagamento",
  "recebimento",
  "financeiro",
  "parcelamento",
  "parcela",
  "caixa",
  "conta",
  "faturamento",
]);

function fieldNames(records: R[]) {
  const counts = new Map<string, number>();
  for (const r of records.slice(0, 1000)) {
    for (const key of Object.keys(r)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([field, count]) => ({ field, count }));
}

function collectionIdSet(records: R[]) {
  const ids = new Set<string>();
  for (const r of records) {
    const id = first(r, ["id", "_id", "codigo", "code"]);
    if (id !== null) ids.add(String(id));
  }
  return ids;
}

function referenceFields(records: R[]) {
  const keys = [
    "clienteId", "idCliente", "customerId", "cliente", "cliente_id",
    "produtoId", "idProduto", "productId", "produto", "produto_id",
    "vendaId", "idVenda", "saleId", "contaId", "idConta",
  ];
  return keys.map((key) => ({
    field: key,
    occurrences: records.reduce((n, r) => n + (r[key] !== undefined && r[key] !== null && String(r[key]).trim() !== "" ? 1 : 0), 0),
  })).filter((x) => x.occurrences > 0);
}

function analyzeCollection(name: string, records: R[]) {
  const key = norm(name);
  const known = financialCollections.find((x) => x.key === key);
  const financialName = possibleFinancial.has(key);
  const score = known?.score ?? (financialName ? 75 : 0);
  const reason = known?.reason ?? (financialName ? "Nome da coleção sugere conteúdo financeiro; precisa de validação antes da importação." : "Coleção não classificada como financeira nesta etapa.");

  let amountTotal = 0;
  let countWithDate = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const r of records) {
    const date = dateValue(first(r, ["data", "date", "createdAt", "created_at", "lancamento", "vencimento", "dataVenda"]));
    if (date) {
      countWithDate++;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }

    const amount =
      key === "venda"
        ? saleTotal(r)
        : numberValue(first(r, ["valor", "total", "amount", "valorTotal"]));
    if (amount !== 0) {
      amountTotal += amount;
      if (amount > 0) positiveCount++;
      if (amount < 0) negativeCount++;
    }
  }

  return {
    collection: name,
    normalized: key,
    count: records.length,
    confidence: score,
    classification: score >= 75 ? "FINANCEIRO" : "NÃO CLASSIFICADO",
    reason,
    fields: fieldNames(records),
    referenceFields: referenceFields(records),
    dateCoverage: {
      withDate: countWithDate,
      withoutDate: Math.max(0, records.length - countWithDate),
      first: minDate?.toISOString() ?? null,
      last: maxDate?.toISOString() ?? null,
    },
    amount: {
      total: Math.round(amountTotal * 100) / 100,
      positiveRecords: positiveCount,
      negativeRecords: negativeCount,
    },
  };
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const records = body?.records;

    if (!Array.isArray(records)) {
      return NextResponse.json({ ok: false, error: "O backup precisa ser uma lista JSON." }, { status: 400 });
    }
    if (records.length === 0) {
      return NextResponse.json({ ok: false, error: "O backup está vazio." }, { status: 400 });
    }

    const typed = records.filter((r: unknown): r is R => Boolean(r && typeof r === "object" && !Array.isArray(r)));
    if (typed.length !== records.length) {
      return NextResponse.json({ ok: false, error: "O backup contém registros que não são objetos JSON." }, { status: 400 });
    }

    const grouped = new Map<string, R[]>();
    for (const record of typed) {
      const name = String(record.collection_key ?? record.collection ?? "SEM_COLLECTION");
      const list = grouped.get(name) ?? [];
      list.push(record);
      grouped.set(name, list);
    }

    const collections = [...grouped.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, rows]) => analyzeCollection(name, rows));

    const candidates = collections.filter((x) => x.confidence >= 75);
    const unknownFinancialCandidates = collections.filter(
      (x) => x.confidence > 0 && x.confidence < 75
    );

    const sales = grouped.get("Venda") ?? grouped.get("venda") ?? [];
    const movements = grouped.get("Movimentacao") ?? grouped.get("movimentacao") ?? [];
    const receivable = grouped.get("ContaAReceber") ?? grouped.get("contaareceber") ?? [];
    const payable = grouped.get("ContaAPagar") ?? grouped.get("contaapagar") ?? [];
    const customerIds = collectionIdSet(
      [...(grouped.get("Cliente") ?? []), ...(grouped.get("cliente") ?? [])]
    );
    const productIds = collectionIdSet(
      [...(grouped.get("Produto") ?? []), ...(grouped.get("produto") ?? [])]
    );

    let salesBilling = 0;
    let salesWithCustomerRef = 0;
    let salesWithProductRef = 0;
    for (const sale of sales) {
      salesBilling += saleTotal(sale);
      const customerRef = first(sale, ["clienteId", "idCliente", "customerId", "cliente"]);
      const productRef = first(sale, ["produtoId", "idProduto", "productId", "produto"]);
      if (customerRef !== null) salesWithCustomerRef++;
      if (productRef !== null) salesWithProductRef++;
    }

    const movementTotal = movements.reduce(
      (sum, row) => sum + numberValue(first(row, ["valor", "amount", "total"])),
      0
    );

    const receivableOpen = receivable.reduce((sum, row) => {
      if (row.archived === true) return sum;
      const value = numberValue(row.valor);
      const installments = Array.isArray(row.parcelas) ? row.parcelas.map(numberValue) : [];
      const paid = Array.isArray(row.pagos) ? row.pagos.length : 0;
      const open = installments.length
        ? installments.slice(Math.min(paid, installments.length)).reduce((a, b) => a + b, 0)
        : value;
      return sum + Math.max(0, open);
    }, 0);

    const payableOpen = payable.reduce((sum, row) => {
      if (row.archived === true) return sum;
      const value = numberValue(row.valor);
      const installments = Array.isArray(row.parcelas) ? row.parcelas.map(numberValue) : [];
      const paid = Array.isArray(row.pagos) ? row.pagos.length : 0;
      const open = installments.length
        ? installments.slice(Math.min(paid, installments.length)).reduce((a, b) => a + b, 0)
        : value;
      return sum + Math.max(0, open);
    }, 0);

    const referencedCustomerIds = sales
      .map((sale) => first(sale, ["clienteId", "idCliente", "customerId"]))
      .filter((v): v is string | number => v !== null)
      .map(String);
    const referencedProductIds = sales
      .map((sale) => first(sale, ["produtoId", "idProduto", "productId"]))
      .filter((v): v is string | number => v !== null)
      .map(String);

    const unresolvedCustomerRefs = referencedCustomerIds.filter((id) => !customerIds.has(id)).length;
    const unresolvedProductRefs = referencedProductIds.filter((id) => !productIds.has(id)).length;

    const fingerprint = await cryptoFingerprint(typed);

    return NextResponse.json({
      ok: true,
      mode: "FATURAMENTO_C1_ANALYSIS_ONLY",
      fingerprint,
      totalRecords: typed.length,
      collections: collections.length,
      financialCandidates: candidates,
      possibleAdditionalFinancialCollections: unknownFinancialCandidates,
      summary: {
        salesCount: sales.length,
        billing: Math.round(salesBilling * 100) / 100,
        movementCount: movements.length,
        movementTotal: Math.round(movementTotal * 100) / 100,
        receivableCount: receivable.length,
        receivableOpen: Math.round(receivableOpen * 100) / 100,
        payableCount: payable.length,
        payableOpen: Math.round(payableOpen * 100) / 100,
        salesWithCustomerRef,
        salesWithProductRef,
        unresolvedCustomerRefs,
        unresolvedProductRefs,
      },
      safety: {
        writesPerformed: false,
        operationalDataChanged: false,
        migrationRunCreated: false,
        nextStep: "C2_RECONCILIACAO_DRY_RUN",
      },
    });
  } catch (error) {
    return apiError(error, "Não foi possível analisar o faturamento do backup.");
  }
}

async function cryptoFingerprint(records: R[]) {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
}
