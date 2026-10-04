import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type RecordShape = Record<string, unknown>;
const EXPECTED_TOTAL = 5789;
const EXPECTED_COLLECTIONS = 29;
const MIGRATION_TYPES = [
  { key:"CLIENTES", label:"Somente clientes", source:"BEEPSTART_CLIENTES" },
  { key:"PRODUTOS", label:"Somente produtos", source:"BEEPSTART_PRODUTOS" },
  { key:"FATURAMENTO", label:"Somente faturamento / vendas", source:"BEEPSTART_FATURAMENTO" },
] as const;

function keyOf(r: RecordShape, index: number) {
  const collection = String(r.collection_key ?? "SEM_COLLECTION");
  const id = r.id == null ? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex") : String(r.id);
  return `BEEPSTART:${collection}:${id || `INDEX-${index}`}`;
}

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const [runs, completedMigrations, legacyStored, customerTotal, activeCustomers, productTotal, activeProducts] = await Promise.all([
      db.migrationRun.findMany({
        orderBy: { startedAt: "desc" }, take: 10,
        select: { id:true,source:true,sourceFingerprint:true,status:true,total:true,imported:true,mapped:true,warnings:true,errors:true,report:true,startedAt:true,completedAt:true }
      }),
      db.migrationRun.findMany({
        where: { source: { in: MIGRATION_TYPES.map(x=>x.source) }, status:"COMPLETED" },
        orderBy: { completedAt:"desc" },
        select: { id:true,source:true,total:true,imported:true,mapped:true,completedAt:true,report:true }
      }),
      db.legacyRecord.count(),
      db.customer.count(),
      db.customer.count({ where: { active: true } }),
      db.product.count(),
      db.product.count({ where: { active: true } }),
    ]);
    return NextResponse.json({
      ok:true,
      expected:{source:"BEEPSTART",total:EXPECTED_TOTAL,collections:EXPECTED_COLLECTIONS},
      operational:{customerTotal,activeCustomers,productTotal,activeProducts},
      migrationOptions:MIGRATION_TYPES.map(type=>{
        const done=completedMigrations.find(run=>run.source===type.source) || null;
        return {
          key:type.key,
          label:type.label,
          source:type.source,
          completed:Boolean(done),
          blocked:Boolean(done),
          run:done,
        };
      }),
      legacyStored,
      runs
    });
  } catch (error) {
    return apiError(error, "Não foi possível carregar a central de migração.");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const records = body?.records;
    if (!Array.isArray(records)) return NextResponse.json({ok:false,error:"O arquivo precisa conter uma lista JSON de registros."},{status:400});

    const typed = records as RecordShape[];
    const groups = new Map<string, number>();
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    typed.forEach((r,i)=>{
      const collection=String(r.collection_key ?? "SEM_COLLECTION");
      groups.set(collection,(groups.get(collection)??0)+1);
      const key=keyOf(r,i);
      if(seen.has(key)) duplicates.add(key);
      seen.add(key);
    });

    const canonical = JSON.stringify(typed);
    const fingerprint = crypto.createHash("sha256").update(canonical).digest("hex");
    const collectionCounts = Object.fromEntries([...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
    const warnings:string[]=[];
    if(typed.length !== EXPECTED_TOTAL) warnings.push(`Contagem encontrada: ${typed.length}. Esperado: ${EXPECTED_TOTAL}.`);
    if(groups.size !== EXPECTED_COLLECTIONS) warnings.push(`Coleções encontradas: ${groups.size}. Esperado: ${EXPECTED_COLLECTIONS}.`);
    if(duplicates.size) warnings.push(`Chaves duplicadas encontradas: ${duplicates.size}.`);

    return NextResponse.json({
      ok:true,
      audit:{
        source:"BEEPSTART",
        fingerprint,
        total:typed.length,
        collections:groups.size,
        collectionCounts,
        duplicateKeys:duplicates.size,
        warnings,
        readyForDryRun:typed.length===EXPECTED_TOTAL && groups.size===EXPECTED_COLLECTIONS && duplicates.size===0,
        note:"Esta etapa apenas audita o arquivo recebido. Nenhum dado operacional foi alterado."
      }
    });
  } catch (error) {
    return apiError(error, "Não foi possível auditar o backup BeepStart.");
  }
}
