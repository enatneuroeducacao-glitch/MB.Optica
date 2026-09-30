import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type RecordShape = Record<string, unknown>;
const EXPECTED_COLLECTIONS = 29;

function keyOf(r: RecordShape, index: number) {
  const collection = String(r.collection_key ?? "SEM_COLLECTION");
  const id = r.id == null
    ? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")
    : String(r.id);
  return `BEEPSTART:${collection}:${id || `INDEX-${index}`}`;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/^(passwd|password|passwordHash|senha)$/i.test(key)) continue;
      out[key] = sanitize(item);
    }
    return out;
  }
  return value;
}

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN", "GERENTE"]);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const collection = url.searchParams.get("collection")?.trim() || "";
    const take = Math.min(Math.max(Number(url.searchParams.get("take") || 100), 1), 250);

    const rows = await db.legacyRecord.findMany({
      where: {
        source: "BEEPSTART",
        ...(collection ? { collectionKey: { equals: collection, mode: "insensitive" } } : {}),
      },
      orderBy: { importedAt: "desc" },
      // A textual search must inspect the complete legacy index, not only the newest 250 records.
      take: q ? 6000 : take,
      select: { id:true, collectionKey:true, legacyId:true, legacyKey:true, payload:true, status:true, importedAt:true }
    });

    const filtered = q
      ? rows.filter(row => JSON.stringify(row.payload).toLowerCase().includes(q)).slice(0, take)
      : rows;

    const customerRows=filtered.filter(row=>String(row.collectionKey||"").toLowerCase()==="cliente");
    const customerDocs=[...new Set(customerRows.map(row=>{
      const p=(row.payload||{}) as Record<string,unknown>;
      return String(p.cnp||p.cpf||p.cpfCnpj||p.cnpj||p.documento||"").replace(/\D/g,"");
    }).filter(Boolean))];

    const customers=customerDocs.length
      ? await db.customer.findMany({select:{id:true,name:true,cpfCnpj:true},where:{cpfCnpj:{not:null}}})
      : [];
    const byDoc=new Map(customers.map(c=>[String(c.cpfCnpj||"").replace(/\D/g,""),{id:c.id,name:c.name,cpfCnpj:c.cpfCnpj}]));
    const enriched=filtered.map(row=>{
      if(String(row.collectionKey||"").toLowerCase()!=="cliente") return row;
      const p=(row.payload||{}) as Record<string,unknown>;
      const doc=String(p.cnp||p.cpf||p.cpfCnpj||p.cnpj||p.documento||"").replace(/\D/g,"");
      return {...row,matchedCustomer:doc?(byDoc.get(doc)||null):null};
    });

    return NextResponse.json({ ok:true, total:enriched.length, records:enriched });
  } catch (error) {
    return apiError(error, "Não foi possível consultar o legado BeepStart.");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const records = body?.records;
    const fingerprint = String(body?.fingerprint || "");

    if (!Array.isArray(records)) {
      return NextResponse.json({ok:false,error:"O arquivo precisa conter uma lista JSON de registros."},{status:400});
    }

    const typed = records as RecordShape[];
    const canonical = JSON.stringify(typed);
    const computedFingerprint = crypto.createHash("sha256").update(canonical).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || fingerprint !== computedFingerprint) {
      return NextResponse.json({ok:false,error:"Fingerprint inválido ou diferente do conteúdo recebido."},{status:400});
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    const collections = new Set<string>();
    for (const [index, record] of typed.entries()) {
      const collection = String(record.collection_key ?? "SEM_COLLECTION");
      collections.add(collection);
      const key = keyOf(record, index);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }

    if (duplicates.size) {
      return NextResponse.json({
        ok:false,
        error:`O backup contém ${duplicates.size} chave(s) legada(s) duplicada(s). O arquivamento foi bloqueado para preservar a integridade.`
      },{status:409});
    }

    const existing = await db.migrationRun.findUnique({ where:{sourceFingerprint:computedFingerprint}, select:{id:true,status:true,total:true} });
    if (existing) {
      return NextResponse.json({
        ok:true,
        alreadyStored:true,
        run:existing,
        message:"Este backup já está arquivado na Central de Legado. Nenhum novo registro foi criado."
      });
    }

    const run = await db.$transaction(async tx => {
      const createdRun = await tx.migrationRun.create({
        data:{
          source:"BEEPSTART",
          sourceFingerprint:computedFingerprint,
          status:"LEGACY_ONLY",
          total:typed.length,
          imported:typed.length,
          mapped:0,
          warnings:0,
          errors:0,
          report:{
            mode:"LEGACY_ONLY",
            readOnly:true,
            collections:[...collections].sort(),
            sourceTotal:typed.length,
            sanitizedSensitiveFields:true,
          }
        }
      });

      await tx.legacyRecord.createMany({
        data: typed.map((record,index) => {
          const collectionKey = String(record.collection_key ?? "SEM_COLLECTION");
          const legacyId = record.id == null ? null : String(record.id);
          return {
            source:"BEEPSTART",
            collectionKey,
            legacyId,
            legacyKey:keyOf(record,index),
            payload:sanitize(record) as object,
            migrationRunId:createdRun.id,
            status:"PRESERVED",
          };
        })
      });

      return createdRun;
    });

    return NextResponse.json({
      ok:true,
      alreadyStored:false,
      run,
      message:`${typed.length.toLocaleString("pt-BR")} registros foram arquivados no modo somente leitura. Nenhum dado operacional foi criado ou alterado.`
    });
  } catch (error) {
    return apiError(error, "Não foi possível arquivar o backup no legado.");
  }
}
