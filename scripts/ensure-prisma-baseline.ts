import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE = "0_init";
const EXISTING_SCHEMA_TABLE = "User";

async function main() {
  const prisma = new PrismaClient();
  let ledgerExists = false;
  let baselineApplied = false;
  let schemaExists = false;

  try {
    const ledger = await prisma.$queryRawUnsafe(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'_prisma_migrations\' LIMIT 1'
    );
    ledgerExists = Array.isArray(ledger) && ledger.length > 0;

    if (ledgerExists) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1',
        BASELINE
      );
      baselineApplied = Array.isArray(rows) && rows.length > 0;
    }

    const tables = await prisma.$queryRawUnsafe(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = $1 LIMIT 1',
      EXISTING_SCHEMA_TABLE
    );
    schemaExists = Array.isArray(tables) && tables.length > 0;
  } finally {
    await prisma.$disconnect();
  }

  // Existing production database: register the baseline without touching data.
  // Fresh database: do NOT mark the baseline as applied; migrate deploy must create it.
  if (schemaExists && !baselineApplied) {
    console.log(`[prisma] existing schema detected; registering production baseline: ${BASELINE}`);
    execSync(`npx prisma migrate resolve --applied ${BASELINE}`, {
      stdio: "inherit",
    });
  } else if (!schemaExists) {
    console.log("[prisma] fresh database detected; applying migrations normally.");
  } else {
    console.log(`[prisma] production baseline already registered: ${BASELINE}`);
  }

  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`[prisma] migrate deploy attempt ${attempt}/${attempts}`);
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn("[prisma] migrate deploy could not acquire the database lock; retrying...");
      execSync("node -e \"setTimeout(() => {}, 12000)\"");
    }
  }
}

main().catch((error) => {
  console.error("[prisma] migration bootstrap failed:", error);
  process.exit(1);
});
