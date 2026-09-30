import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL não configurada.");
}

try {
  const [customers, products, migrations] = await Promise.all([
    db.customer.count(),
    db.product.count(),
    db.migrationRun.count(),
  ]);

  const activeCustomers = await db.customer.count({ where: { active: true } });
  const activeProducts = await db.product.count({ where: { active: true } });

  console.log(JSON.stringify({
    status: "OK",
    databaseConfigured: true,
    operational: {
      customers: { total: customers, active: activeCustomers },
      products: { total: products, active: activeProducts },
      migrationRuns: migrations
    },
    nextStep: "Se os números correspondem ao MB atual, executar o backup operacional protegido antes de qualquer novo backup BeepStart."
  }, null, 2));
} catch (error) {
  console.error("Falha no preflight do banco operacional.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await db.$disconnect();
}
