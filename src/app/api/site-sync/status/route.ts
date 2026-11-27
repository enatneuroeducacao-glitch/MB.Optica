import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isSiteSyncEnabled } from "@/lib/site-stock-sync";

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);
    const grouped = await db.siteSyncOutbox.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.status] = row._count._all;
    return NextResponse.json({
      enabled: isSiteSyncEnabled(),
      pending: counts.PENDING || 0,
      processing: counts.PROCESSING || 0,
      failed: counts.FAILED || 0,
      completed: counts.DONE || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível consultar a fila de sincronização." },
      { status: 403 },
    );
  }
}

export async function POST() {
  try {
    await requireRole(["ADMIN"]);
    if (!isSiteSyncEnabled()) {
      return NextResponse.json({ error: "Ative a sincronização opcional antes de reenviar pendências." }, { status: 409 });
    }
    const retried = await db.siteSyncOutbox.updateMany({
      where: { status: "FAILED" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lastError: null },
    });
    return NextResponse.json({ retried: retried.count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível reprocessar a fila." },
      { status: 403 },
    );
  }
}
