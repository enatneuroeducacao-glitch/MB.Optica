import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE = "0_init";

async function main() {
  const prisma = new PrismaClient();
  let applied = false;

  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1',
      BASELINE
    );
    applied = Array.isArray(rows) && rows.length > 0;
  } catch {
    // The migration ledger may not exist yet. The resolve command will create/initialize it.
  } finally {
    await prisma.$disconnect();
  }

  if (!applied) {
    console.log(`[prisma] registering production baseline: ${BASELINE}`);
    execSync(`npx prisma migrate resolve --applied ${BASELINE}`, {
      stdio: "inherit",
    });
  } else {
    console.log(`[prisma] production baseline already registered: ${BASELINE}`);
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
  });
}

main().catch((error) => {
  console.error("[prisma] migration bootstrap failed:", error);
  process.exit(1);
});
