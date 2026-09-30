import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type R = Record<string, any>;
const norm = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const text = (v: any) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
};
const first = (o: R, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return o[k];
  return null;
};

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const records = body?.records;
    if (!Array.isArray(records)) {
      return NextResponse.json({ ok: false, error: "O backup precisa ser uma lista JSON." }, { status: 400 });
    }

    const rawText = JSON.stringify(records);
    const fingerprint = crypto.createHash("sha256").update(rawText).digest("hex");
    const byCollection = new Map<string, R[]>();
    for (const r of records as R[]) {
      const key = String(r.collection_key ?? "SEM_COLLECTION");
      const list = byCollection.get(key) ?? [];
      list.push(r);
      byCollection.set(key, list);
    }

    const customers = byCollection.get("Cliente") ?? [];
    const products = byCollection.get("Produto") ?? [];

    const [existingCustomers, existingProducts, existingRun] = await Promise.all([
      db.customer.findMany({ select: { id: true, name: true, cpfCnpj: true, phone: true } }),
      db.product.findMany({ select: { id: true, code: true, barcode: true, description: true, brand: true, model: true } }),
      db.migrationRun.findUnique({ where: { sourceFingerprint: fingerprint }, select: { status: true } }),
    ]);

    const cpfMap = new Map<string, string>();
    const namePhoneMap = new Map<string, string>();
    for (const c of existingCustomers) {
      if (c.cpfCnpj) cpfMap.set(norm(c.cpfCnpj), c.id);
      if (c.phone) namePhoneMap.set(`${norm(c.name)}|${norm(c.phone)}`, c.id);
    }

    const codeMap = new Map<string, string>();
    const barcodeMap = new Map<string, string>();
    const productIdentityMap = new Map<string, string>();
    for (const p of existingProducts) {
      if (p.code) codeMap.set(norm(p.code), p.id);
      if (p.barcode) barcodeMap.set(norm(p.barcode), p.id);
      productIdentityMap.set(`${norm(p.description)}|${norm(p.brand)}|${norm(p.model)}`, p.id);
    }

    let customerMatched = 0;
    let customerNew = 0;
    let productMatched = 0;
    let productNew = 0;

    for (const c of customers) {
      const name = text(first(c, ["name", "nome"])) ?? "";
      const cpf = text(first(c, ["cpf", "cnp", "cpfCnpj", "document"]));
      const phone = text(first(c, ["phone", "telefone", "celular"]));
      const matched = (cpf ? cpfMap.get(norm(cpf)) : undefined) ??
        (phone ? namePhoneMap.get(`${norm(name)}|${norm(phone)}`) : undefined);
      if (matched) customerMatched++;
      else customerNew++;
    }

    for (const p of products) {
      const code = text(first(p, ["codigo", "code", "codigoProduto"])) ?? (p.id == null ? null : String(p.id));
      const barcode = text(first(p, ["barcode", "codigoBarras", "ean"]));
      const description = text(first(p, ["description", "descricao", "name"])) ?? "";
      const brand = text(first(p, ["brand", "marca"]));
      const model = text(first(p, ["model", "modelo"]));
      const matched = (barcode ? barcodeMap.get(norm(barcode)) : undefined) ??
        (code ? codeMap.get(norm(code)) : undefined) ??
        productIdentityMap.get(`${norm(description)}|${norm(brand)}|${norm(model)}`,);
      if (matched) productMatched++;
      else productNew++;
    }

    return NextResponse.json({
      ok: true,
      preview: {
        fingerprint,
        totalRecords: records.length,
        customerSource: customers.length,
        customerMatched,
        customerNew,
        productSource: products.length,
        productMatched,
        productNew,
        otherRecords: records.length - customers.length - products.length,
        alreadyProcessed: existingRun?.status === "COMPLETED",
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao preparar a prévia." }, { status: 500 });
  }
}
