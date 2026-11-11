import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type TableRow = { table_name: string };
type CountRow = { count: bigint | number | string };

async function countRows(table: string, where = "") {
  const identifier = '"' + table.replace(/"/g, '""') + '"';
  const rows = await db.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(*)::bigint AS count FROM public.${identifier} ${where}`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  // Read-only preflight. No INSERT/UPDATE/DELETE/DDL is issued by this script.
  const scopedTables = await db.$queryRaw<TableRow[]> `
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organizationId'
    ORDER BY table_name
  `;

  const organizations = await countRows("Organization");
  const memberships = await countRows("OrganizationMembership");
  const activeUsers = await countRows("User", 'WHERE "active" = true');
  const unassignedSubscriptions = await countRows("Subscription", 'WHERE "organizationId" IS NULL');

  const tables = [];
  for (const { table_name } of scopedTables) {
    const total = await countRows(table_name);
    const unassigned = await countRows(table_name, 'WHERE "organizationId" IS NULL');
    const orphaned = await countRows(
      table_name,
      'WHERE "organizationId" IS NOT NULL AND "organizationId" NOT IN (SELECT "id" FROM "Organization")',
    );
    tables.push({ table: table_name, total, unassigned, orphaned });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_PREFLIGHT",
    databaseTarget: process.env.DATABASE_URL ? "DATABASE_URL configured (value hidden)" : "DATABASE_URL missing",
    summary: {
      organizations,
      memberships,
      activeUsers,
      unassignedSubscriptions,
      scopedTables: tables.length,
      totalScopedRows: tables.reduce((sum, row) => sum + row.total, 0),
      unassignedScopedRows: tables.reduce((sum, row) => sum + row.unassigned, 0),
      orphanedScopedRows: tables.reduce((sum, row) => sum + row.orphaned, 0),
    },
    tables,
    safety: {
      wroteData: false,
      appliedMigrations: false,
      createdOrganization: false,
      assignedMemberships: false,
      note: "Use this report to plan a reviewed transactional backfill. Do not infer ownership from global User.role alone.",
    },
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main()
  .catch((error) => {
    process.stderr.write(String(error instanceof Error ? error.stack ?? error.message : error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
