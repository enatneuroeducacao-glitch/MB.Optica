import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";

type R = Record<string, any>;
const db = new PrismaClient();

const norm = (v: any) =>
  String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const text = (v: any) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
};
const first = (o: R, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return o[k];
  return null;
};
const idOf = (r: R) => r?.id == null ? null : String(r.id);
const legacyKey = (r: R, fingerprint: string) =>
  `BEEPSTART:${fingerprint}:${String(r.collection_key ?? "SEM_COLLECTION")}:${idOf(r) ?? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")}`;
const money = (v: any) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? 0).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dec = (v: any) => new Prisma.Decimal(money(v).toFixed(2));

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const allRecords = body?.records;
    const migrationType = String(body?.migrationType || "").toUpperCase();
    const migrationConfig = {
      CLIENTES: { source:"BEEPSTART_CLIENTES", collection:"Cliente" },
      PRODUTOS: { source:"BEEPSTART_PRODUTOS", collection:"Produto" },
    } as const;
    if (!(migrationType in migrationConfig)) {
      return NextResponse.json({ ok:false, error:"Tipo de migração inválido. Escolha Clientes ou Produtos." }, { status:400 });
    }
    const config = migrationConfig[migrationType as keyof typeof migrationConfig];
    const selectedKeys: string[] = Array.isArray(body?.selectedKeys) ? body.selectedKeys.map((value: unknown) => String(value)) : [];
    const nonStockProductKeys: string[] = Array.isArray(body?.nonStockProductKeys) ? body.nonStockProductKeys.map((value: unknown) => String(value)) : [];

    if (!Array.isArray(allRecords)) {
      return NextResponse.json({ ok: false, error: "O backup precisa ser uma lista JSON." }, { status: 400 });
    }

    const rawText = JSON.stringify(allRecords);
    const backupFingerprint = crypto.createHash("sha256").update(rawText).digest("hex");
    if (selectedKeys.length === 0) return NextResponse.json({ ok: false, error: "Nenhum registro foi selecionado para reconciliação." }, { status: 400 });
    const uniqueSelectedKeys = [...new Set(selectedKeys)].sort();
    const uniqueNonStockProductKeys = [...new Set(nonStockProductKeys)].sort();
    const invalidNonStockKeys = uniqueNonStockProductKeys.filter((key) => !uniqueSelectedKeys.includes(key));
    if (invalidNonStockKeys.length) return NextResponse.json({ ok: false, error: "Há lentes marcadas como sem estoque que não estão na seleção de produtos." }, { status: 400 });
    const selectionFingerprint = crypto.createHash("sha256").update(JSON.stringify({ selectedKeys: uniqueSelectedKeys, nonStockProductKeys: uniqueNonStockProductKeys })).digest("hex");
    const fingerprint = "BEEPSTART_SELECTED:" + backupFingerprint + ":" + selectionFingerprint;

    const selectedSet = new Set(uniqueSelectedKeys);
    const nonStockProductSet = new Set(uniqueNonStockProductKeys);
    if (migrationType === "CLIENTES" && uniqueNonStockProductKeys.length) {
      return NextResponse.json({ ok:false, error:"A migração de clientes não aceita classificação de produtos." }, { status:400 });
    }
    const records = (allRecords as R[]).filter((r) => selectedSet.has(legacyKey(r, backupFingerprint)));
    if (records.length !== uniqueSelectedKeys.length) return NextResponse.json({ ok: false, error: "A seleção contém registros que não pertencem ao backup informado." }, { status: 400 });
    const invalidCollections = records.filter(r => String(r.collection_key ?? "") !== config.collection);
    if (invalidCollections.length) {
      const label = migrationType === "CLIENTES" ? "de clientes" : "de produtos";
      return NextResponse.json({ ok:false, error:"A migração " + label + " aceita somente registros da coleção " + config.collection + "." }, { status:400 });
    }

    const completedMigration = await db.migrationRun.findFirst({
      where: { source: config.source, status:"COMPLETED" },
      select: { id:true,completedAt:true,total:true,report:true }
    });
    if (completedMigration) {
      const label = migrationType === "CLIENTES" ? "de clientes" : "de produtos";
      return NextResponse.json({
        ok:false,
        blocked:true,
        error:"A migração " + label + " do BeepStart já foi concluída e está bloqueada para nova execução.",
        run:completedMigration
      }, { status:409 });
    }

    const existingRun = await db.migrationRun.findUnique({ where: { sourceFingerprint: fingerprint } });
    if (existingRun?.status === "COMPLETED") {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        fingerprint,
        result: existingRun.report
      });
    }

    const byCollection = new Map<string, R[]>();
    for (const r of records as R[]) {
      const key = String(r.collection_key ?? "SEM_COLLECTION");
      const list = byCollection.get(key) ?? [];
      list.push(r);
      byCollection.set(key, list);
    }

    const customers = byCollection.get("Cliente") ?? [];
    const products = byCollection.get("Produto") ?? [];

    const customerIdentity = new Set<string>();
    const productIdentity = new Set<string>();
    for (const c of customers) {
      const cpf = text(first(c, ["cpf", "cnp", "cpfCnpj", "document"]));
      if (cpf) { const k = "CPF:" + norm(cpf); if (customerIdentity.has(k)) return NextResponse.json({ ok:false, error:"Há dois clientes selecionados com o mesmo CPF/CNPJ. Selecione apenas um para evitar duplicidade." }, { status:400 }); customerIdentity.add(k); }
    }
    for (const p of products) {
      const barcode = text(first(p, ["barcode", "codigoBarras", "ean"]));
      if (barcode) { const k = "BARCODE:" + norm(barcode); if (productIdentity.has(k)) return NextResponse.json({ ok:false, error:"Há dois produtos selecionados com o mesmo código de barras. Selecione apenas um." }, { status:400 }); productIdentity.add(k); }
    }

    const result = await db.$transaction(async tx => {
      const run = await tx.migrationRun.create({
        data: {
          source: config.source,
          sourceFingerprint: fingerprint,
          status: "RUNNING",
          total: records.length
        }
      });

      const [existingCustomers, existingProducts, existingLegacy] = await Promise.all([
        tx.customer.findMany({ select: { id: true, name: true, cpfCnpj: true, phone: true } }),
        tx.product.findMany({ select: { id: true, code: true, barcode: true, description: true, brand: true, model: true, stockControlled: true } }),
        tx.legacyRecord.findMany({ select: { legacyKey: true, collectionKey: true, legacyId: true, targetEntity: true, targetId: true, status: true } })
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

      const existingLegacySet = new Set(existingLegacy.map(x => x.legacyKey));
      const customerIds = new Set(existingCustomers.map(x => x.id));
      const productIds = new Set(existingProducts.map(x => x.id));
      const existingLegacyIdentity = new Map<string, { entity: string | null; id: string | null; status: string }>();
      for (const x of existingLegacy) {
        if (!x.collectionKey || !x.legacyId || !x.targetId) continue;
        const targetExists = x.targetEntity === "Customer" ? customerIds.has(String(x.targetId)) : x.targetEntity === "Product" ? productIds.has(String(x.targetId)) : true;
        if (targetExists) existingLegacyIdentity.set(String(x.collectionKey) + ":" + String(x.legacyId), { entity: x.targetEntity, id: x.targetId, status: x.status });
      }
      const target = new Map<string, { entity: string; id: string; status: string }>();
      const warnings: string[] = [];

      let customerCreated = 0;
      let customerMatched = 0;
      let productCreated = 0;
      let productMatched = 0;
      let legacyCreated = 0;

      const newCustomers: any[] = [];
      for (const c of customers) {
        const legacy = legacyKey(c, backupFingerprint);
        const alreadyReconciled = existingLegacyIdentity.get("Cliente:" + (idOf(c) ?? ""));
        if (alreadyReconciled) {
          target.set(legacy, { entity: alreadyReconciled.entity ?? "Customer", id: alreadyReconciled.id ?? "", status: "RECONCILED" });
          continue;
        }
        if (existingLegacySet.has(legacy)) {
          target.set(legacy, { entity: "Customer", id: cpfMap.get(norm(first(c, ["cpf", "cnp", "cpfCnpj", "document"]))) ?? "", status: "LEGACY_ALREADY_PRESENT" });
          continue;
        }

        const name = text(first(c, ["name", "nome"])) ?? `Cliente ${idOf(c) ?? "legado"}`;
        const cpf = text(first(c, ["cpf", "cnp", "cpfCnpj", "document"]));
        const phone = text(first(c, ["phone", "telefone", "celular"]));
        const keyCpf = cpf ? cpfMap.get(norm(cpf)) : undefined;
        const keyNamePhone = phone ? namePhoneMap.get(`${norm(name)}|${norm(phone)}`) : undefined;
        const matchedId = keyCpf ?? keyNamePhone;

        if (matchedId) {
          target.set(legacy, { entity: "Customer", id: matchedId, status: "MATCHED" });
          customerMatched++;
          continue;
        }

        const cid = crypto.randomUUID();
        newCustomers.push({
          id: cid,
          name,
          cpfCnpj: cpf,
          phone,
          whatsapp: text(first(c, ["whatsapp"])),
          email: text(first(c, ["email", "eMail"])),
          notes: "Incluído por reconciliação incremental do BeepStart",
          active: true
        });
        if (cpf) cpfMap.set(norm(cpf), cid);
        if (phone) namePhoneMap.set(`${norm(name)}|${norm(phone)}`, cid);
        target.set(legacy, { entity: "Customer", id: cid, status: "CREATED" });
        customerCreated++;
      }

      if (newCustomers.length) await tx.customer.createMany({ data: newCustomers });

      for (const p of products) {
        const legacy = legacyKey(p, backupFingerprint);
        const alreadyReconciled = existingLegacyIdentity.get("Produto:" + (idOf(p) ?? ""));
        if (alreadyReconciled) {
          target.set(legacy, { entity: alreadyReconciled.entity ?? "Product", id: alreadyReconciled.id ?? "", status: "RECONCILED" });
          continue;
        }
        if (existingLegacySet.has(legacy)) {
          target.set(legacy, { entity: "Product", id: "", status: "LEGACY_ALREADY_PRESENT" });
          continue;
        }

        const code = text(first(p, ["codigo", "code", "codigoProduto"])) ?? idOf(p);
        const barcode = text(first(p, ["barcode", "codigoBarras", "ean"]));
        const description = text(first(p, ["description", "descricao", "name"])) ?? `Produto ${idOf(p) ?? "legado"}`;
        const brand = text(first(p, ["brand", "marca"]));
        const model = text(first(p, ["model", "modelo"]));

        const matchedId =
          (barcode ? barcodeMap.get(norm(barcode)) : undefined) ??
          (code ? codeMap.get(norm(code)) : undefined) ??
          productIdentityMap.get(`${norm(description)}|${norm(brand)}|${norm(model)}`);

        if (matchedId) {
          if (nonStockProductSet.has(legacy)) {
            await tx.product.update({ where: { id: matchedId }, data: { stockControlled: false } });
          }
          target.set(legacy, { entity: "Product", id: matchedId, status: "MATCHED" });
          productMatched++;
          continue;
        }

        let finalCode = code ?? `BS-${idOf(p) ?? crypto.randomUUID()}`;
        if (codeMap.has(norm(finalCode))) finalCode = `BS-${finalCode}`;

        const pid = crypto.randomUUID();
        const row = {
          id: pid,
          code: finalCode,
          barcode,
          description,
          brand,
          model,
          color: text(first(p, ["color", "cor"])),
          frameSize: text(first(p, ["frameSize", "tamanho", "aro"])),
          material: text(first(p, ["material"])),
          unit: text(first(p, ["unit", "unidade"])) ?? "UN",
          cost: dec(first(p, ["custo", "cost", "precoCusto"])),
          salePrice: dec(first(p, ["venda", "salePrice", "preco", "precoVenda"])),
          minimumStock: dec(first(p, ["estoqueMinimo", "minimumStock"])),
          stockControlled: !nonStockProductSet.has(legacy),
          active: true
        };
        await tx.product.create({ data: row });
        codeMap.set(norm(finalCode), pid);
        if (barcode) barcodeMap.set(norm(barcode), pid);
        productIdentityMap.set(`${norm(description)}|${norm(brand)}|${norm(model)}`, pid);
        target.set(legacy, { entity: "Product", id: pid, status: "CREATED" });
        productCreated++;
      }

      const legacyRows = (records as R[]).filter(r => {
        const k = legacyKey(r, backupFingerprint);
        return !existingLegacySet.has(k);
      }).map(r => {
        const t = target.get(legacyKey(r, backupFingerprint));
        return {
          id: crypto.randomUUID(),
          source: "BEEPSTART",
          collectionKey: String(r.collection_key ?? "SEM_COLLECTION"),
          legacyId: idOf(r),
          legacyKey: legacyKey(r, backupFingerprint),
          payload: r,
          customerId: t?.entity === "Customer" && t.id ? t.id : null,
          migrationRunId: run.id,
          targetEntity: t?.entity ?? null,
          targetId: t?.id || null,
          status: t ? (t.status === "CREATED" ? "IMPORTED" : "MATCHED") : "PRESERVED"
        };
      });

      if (legacyRows.length) {
        await tx.legacyRecord.createMany({ data: legacyRows });
        legacyCreated = legacyRows.length;
      }

      const report = {
        mode: "INCREMENTAL_SAFE",
        migrationType,
        source: "BEEPSTART",
        backupFingerprint,
        selectionFingerprint,
        selectedKeys: uniqueSelectedKeys,
        nonStockProductKeys: uniqueNonStockProductKeys,
        fingerprint,
        totalRecords: records.length,
        customerSource: customers.length,
        customerCreated,
        customerMatched,
        productSource: products.length,
        productCreated,
        productMatched,
        legacyCreated,
        warnings
      };

      await tx.migrationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          imported: customerCreated + productCreated,
          mapped: customerMatched + productMatched,
          warnings: warnings.length,
          errors: 0,
          report,
          completedAt: new Date()
        }
      });

      return report;
    }, { maxWait: 10000, timeout: 120000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("INCREMENTAL SAFE IMPORT:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha na reconciliação incremental." }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
