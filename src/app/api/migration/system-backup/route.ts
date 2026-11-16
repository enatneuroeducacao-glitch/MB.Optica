import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const FORMAT = "MB_GESTAO_FULL_BACKUP_V1";
const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + "'";

async function getPublicTables(client: typeof db) {
  return client.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;
}

async function buildTableOrder(client: typeof db, names: string[]) {
  const edges = await client.$queryRaw<Array<{ child: string; parent: string }>>`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE c.contype = 'f'
      AND child_ns.nspname = 'public'
  `;
  const known = new Set(names);
  const incoming = new Map(names.map(name => [name, 0]));
  const children = new Map(names.map(name => [name, [] as string[]]));
  for (const edge of edges) {
    if (!known.has(edge.child) || !known.has(edge.parent) || edge.child === edge.parent) continue;
    children.get(edge.parent)!.push(edge.child);
    incoming.set(edge.child, (incoming.get(edge.child) || 0) + 1);
  }
  const ready = names.filter(name => incoming.get(name) === 0).sort();
  const ordered: string[] = [];
  while (ready.length) {
    const current = ready.shift()!;
    ordered.push(current);
    for (const child of children.get(current) || []) {
      const next = (incoming.get(child) || 0) - 1;
      incoming.set(child, next);
      if (next === 0) ready.push(child);
    }
    ready.sort();
  }
  // Cyclic foreign-key groups are appended deterministically; the restore transaction
  // will reject the entire operation if the database cannot accept their dependencies.
  for (const name of names) if (!ordered.includes(name)) ordered.push(name);
  return ordered;
}

function fingerprint(payload: { format: string; createdAt: string; tableOrder: string[]; tables: Record<string, unknown[]>; counts: Record<string, number> }) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const discovered = await getPublicTables(db);
    const names = discovered.map(item => item.table_name);
    const tableOrder = await buildTableOrder(db, names);
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const name of tableOrder) {
      const rows = await db.$queryRawUnsafe<Array<{ rows: unknown[] }>>(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS rows FROM ${quote(name)} AS t`
      );
      tables[name] = rows[0]?.rows || [];
      counts[name] = tables[name].length;
    }
    const payload = {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      tableOrder,
      tables,
      counts,
    };
    return NextResponse.json(
      { ...payload, fingerprint: fingerprint(payload) },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" } }
    );
  } catch (error) {
    return apiError(error, "Não foi possível gerar o backup integral do MB Gestão.");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 100 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "O backup excede o limite de 100 MB por operação." }, { status: 413 });
    }

    let archive: any;
    try { archive = JSON.parse(raw); }
    catch { return NextResponse.json({ ok: false, error: "Arquivo de backup inválido ou corrompido." }, { status: 400 }); }

    if (!archive || archive.format !== FORMAT || !Array.isArray(archive.tableOrder) ||
        !archive.tables || typeof archive.tables !== "object" || !archive.counts ||
        typeof archive.fingerprint !== "string") {
      return NextResponse.json({ ok: false, error: "Formato incompatível. Selecione um backup integral gerado pelo próprio MB Gestão." }, { status: 400 });
    }

    const payload = {
      format: archive.format,
      createdAt: archive.createdAt,
      tableOrder: archive.tableOrder,
      tables: archive.tables,
      counts: archive.counts,
    };
    if (fingerprint(payload) !== archive.fingerprint) {
      return NextResponse.json({ ok: false, error: "A assinatura SHA-256 não confere. O backup pode estar incompleto ou ter sido alterado." }, { status: 409 });
    }

    const discovered = await getPublicTables(db);
    const currentNames = discovered.map(item => item.table_name);
    const archiveNames = [...new Set(archive.tableOrder.map((name: unknown) => String(name)))];
    const missing = currentNames.filter(name => !archiveNames.includes(name));
    const unknown = archiveNames.filter(name => !currentNames.includes(name));
    if (missing.length || unknown.length) {
      return NextResponse.json({
        ok: false,
        error: "A estrutura do banco de dados não corresponde ao backup. Nenhum dado foi alterado.",
        details: { missingTables: missing, unknownTables: unknown },
      }, { status: 409 });
    }

    for (const name of archiveNames) {
      if (!Array.isArray(archive.tables[name])) {
        return NextResponse.json({ ok: false, error: `A coleção "${name}" está ausente ou inválida no backup.` }, { status: 400 });
      }
      if (archive.tables[name].length !== Number(archive.counts[name])) {
        return NextResponse.json({ ok: false, error: `A contagem da coleção "${name}" não confere com o manifesto.` }, { status: 409 });
      }
    }

    const inserted: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    await db.$transaction(async tx => {
      for (const name of archive.tableOrder as string[]) {
        const rows = archive.tables[name] as unknown[];
        if (!rows.length) { inserted[name] = 0; skipped[name] = 0; continue; }
        const affected = await tx.$executeRawUnsafe(
          `INSERT INTO ${quote(name)} SELECT * FROM jsonb_populate_recordset(NULL::${quote(name)}, $1::jsonb) ON CONFLICT DO NOTHING`,
          JSON.stringify(rows)
        );
        inserted[name] = affected;
        skipped[name] = rows.length - affected;
      }

      const sequences = await tx.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')
      `;
      for (const item of sequences) {
        const table = quote(item.table_name);
        const column = quote(item.column_name);
        await tx.$queryRawUnsafe(
          `SELECT setval(pg_get_serial_sequence($1, $2), GREATEST(COALESCE((SELECT MAX(${column}) FROM ${table}), 1), 1), EXISTS(SELECT 1 FROM ${table}))`,
          item.table_name,
          item.column_name
        );
      }
    }, { maxWait: 15000, timeout: 120000 });

    const insertedTotal = Object.values(inserted).reduce((sum, value) => sum + value, 0);
    const skippedTotal = Object.values(skipped).reduce((sum, value) => sum + value, 0);
    return NextResponse.json({
      ok: true,
      sourceCreatedAt: archive.createdAt,
      fingerprint: archive.fingerprint,
      tables: archive.tableOrder.length,
      insertedTotal,
      skippedTotal,
      inserted,
      skipped,
      message: "Reintegração concluída. Registros existentes foram preservados; somente registros ausentes foram incluídos.",
    });
  } catch (error) {
    return apiError(error, "A reintegração foi interrompida. A transação foi revertida e nenhum lote parcial foi mantido.");
  }
}
