import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const db = new PrismaClient();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL não configurada. O backup não foi executado.");

if (process.env.ALLOW_OPERATIONAL_BACKUP !== "1") {
  fail("Backup operacional bloqueado por segurança. Defina ALLOW_OPERATIONAL_BACKUP=1 para executar.");
}

try {
  const [customers, products] = await Promise.all([
    db.customer.findMany({ orderBy: { id: "asc" } }),
    db.product.findMany({ orderBy: { id: "asc" } }),
  ]);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });

  const output = {
    format: "MB_OPTICA_OPERATIONAL_BACKUP_V1",
    createdAt: new Date().toISOString(),
    source: "production-database",
    warning: "DADOS OPERACIONAIS REAIS. NÃO COMMITAR NO GIT.",
    counts: {
      customers: customers.length,
      products: products.length,
    },
    customers,
    products,
  };

  const file = join(dir, `operational-${stamp}.json`);
  await writeFile(file, JSON.stringify(output, null, 2), "utf8");

  console.log(`Backup operacional criado: ${file}`);
  console.log(`Clientes: ${customers.length}`);
  console.log(`Produtos: ${products.length}`);
} finally {
  await db.$disconnect();
}
