import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const CONFIRM_TOKEN = "DELETE_LATEST_BEEPSTART_MIGRATION";

async function main() {
  const apply = process.env.ROLLBACK_MODE === "apply";
  const confirmed = process.env.ROLLBACK_CONFIRM === CONFIRM_TOKEN;

  const run = await db.migrationRun.findFirst({
    where: { source: "BEEPSTART_INCREMENTAL", status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
    select: { id: true, source: true, status: true, total: true, imported: true, mapped: true, startedAt: true, completedAt: true },
  });

  if (!run) {
    const recentRuns = await db.migrationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, source: true, status: true, total: true, imported: true, mapped: true, startedAt: true, completedAt: true },
    });
    const legacyCount = await db.legacyRecord.count();
    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "PREVIEW",
      foundBeepStartIncrementalCompleted: false,
      legacyRecordCount: legacyCount,
      recentMigrationRuns: recentRuns,
      message: "Nenhuma execução BEEPSTART_INCREMENTAL concluída foi encontrada no banco apontado por MB_OPTICA_DATABASE_URL. Nenhum dado foi alterado.",
    }, null, 2));
    if (apply) throw new Error("Rollback não executado: não foi encontrada uma execução BEEPSTART concluída.");
    return;
  }

  const legacyRows = await db.legacyRecord.findMany({
    where: { migrationRunId: run.id },
    select: { id: true, targetEntity: true, targetId: true, status: true },
  });

  const customerIds = [...new Set(legacyRows.filter(r => r.status === "IMPORTED" && r.targetEntity === "Customer" && r.targetId).map(r => r.targetId as string))];
  const productIds = [...new Set(legacyRows.filter(r => r.status === "IMPORTED" && r.targetEntity === "Product" && r.targetId).map(r => r.targetId as string))];

  const [customers, products] = await Promise.all([
    db.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, _count: { select: { addresses: true, prescriptions: true, quotes: true, orders: true, sales: true, accounts: true, appointments: true } } },
    }),
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, description: true, code: true, _count: { select: { lots: true, movements: true, orderItems: true, quoteItems: true, saleItems: true } } },
    }),
  ]);

  const blockedCustomers = customers.filter(c => Object.values(c._count).some(n => n > 0));
  const blockedProducts = products.filter(p => Object.values(p._count).some(n => n > 0));
  const missingCustomers = customerIds.filter(id => !customers.some(c => c.id === id));
  const missingProducts = productIds.filter(id => !products.some(p => p.id === id));

  const summary = {
    run,
    legacyRecords: legacyRows.length,
    createdCustomers: customerIds.length,
    createdProducts: productIds.length,
    blockedCustomers: blockedCustomers.map(c => ({ id: c.id, name: c.name, references: c._count })),
    blockedProducts: blockedProducts.map(p => ({ id: p.id, description: p.description, code: p.code, references: p._count })),
    missingCustomers,
    missingProducts,
    safeToRollback: blockedCustomers.length === 0 && blockedProducts.length === 0 && missingCustomers.length === 0 && missingProducts.length === 0,
    mode: apply ? "APPLY" : "PREVIEW",
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!apply) return;
  if (!confirmed) throw new Error("ROLLBACK_MODE=apply exige ROLLBACK_CONFIRM=DELETE_LATEST_BEEPSTART_MIGRATION. Nenhum dado foi alterado.");
  if (!summary.safeToRollback) throw new Error("Rollback interrompido: existem referências ou registros ausentes nos alvos criados.");

  await db.$transaction(async tx => {
    await tx.legacyRecord.deleteMany({ where: { migrationRunId: run.id } });
    if (productIds.length) await tx.product.deleteMany({ where: { id: { in: productIds } } });
    if (customerIds.length) await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
    await tx.migrationRun.delete({ where: { id: run.id } });
  });

  console.log(JSON.stringify({ ok: true, rolledBackMigrationRunId: run.id, deletedLegacyRecords: legacyRows.length, deletedCustomers: customerIds.length, deletedProducts: productIds.length }, null, 2));
}

main().catch(error => { console.error("ROLLBACK BEEPSTART:", error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
