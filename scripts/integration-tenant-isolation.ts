import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const baseUrl = process.env.INTEGRATION_BASE_URL;
if (!baseUrl) throw new Error("INTEGRATION_BASE_URL is required");

const stamp = Date.now();
const password = "Tenant-Test-Only-Password-42!";
const emails = ["tenant-a-" + stamp + "@example.invalid", "tenant-b-" + stamp + "@example.invalid"];
const slugs = ["tenant-test-a-" + stamp, "tenant-test-b-" + stamp];
const created = { organizationIds: [] as string[], userIds: [] as string[], customerIds: [] as string[] };

async function login(email: string) {
  const response = await fetch(new URL("/api/auth/login", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Login failed (" + response.status + "): " + await response.text());
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Login did not return the session cookie");
  return cookie;
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const orgs = await Promise.all([
    db.organization.create({ data: { name: "Tenant Isolation A", slug: slugs[0] } }),
    db.organization.create({ data: { name: "Tenant Isolation B", slug: slugs[1] } }),
  ]);
  created.organizationIds.push(...orgs.map((o) => o.id));

  const users = await Promise.all([
    db.user.create({ data: { name: "Tenant Test A", email: emails[0], passwordHash, role: "ADMIN" } }),
    db.user.create({ data: { name: "Tenant Test B", email: emails[1], passwordHash, role: "ADMIN" } }),
  ]);
  created.userIds.push(...users.map((u) => u.id));

  await db.organizationMembership.createMany({
    data: [
      { organizationId: orgs[0].id, userId: users[0].id, role: "ADMIN" },
      { organizationId: orgs[1].id, userId: users[1].id, role: "ADMIN" },
    ],
  });

  const customers = await Promise.all([
    db.customer.create({ data: { organizationId: orgs[0].id, name: "Isolation Customer A" } }),
    db.customer.create({ data: { organizationId: orgs[1].id, name: "Isolation Customer B" } }),
  ]);
  created.customerIds.push(...customers.map((c) => c.id));

  const cookieA = await login(emails[0]);
  const own = await fetch(new URL("/api/customers?organizationId=" + orgs[0].id, baseUrl), {
    headers: { cookie: cookieA },
  });
  if (!own.ok) throw new Error("Own-tenant read failed (" + own.status + "): " + await own.text());
  const ownRows = await own.json() as Array<{ id: string; name: string }>;
  if (!ownRows.some((row) => row.id === customers[0].id)) {
    throw new Error("Tenant A could not read its own customer");
  }
  if (ownRows.some((row) => row.id === customers[1].id)) {
    throw new Error("SECURITY FAILURE: Tenant A received Tenant B customer data");
  }

  const cross = await fetch(new URL("/api/customers?organizationId=" + orgs[1].id, baseUrl), {
    headers: { cookie: cookieA },
  });
  if (cross.status !== 403) {
    throw new Error("SECURITY FAILURE: cross-tenant selector returned HTTP " + cross.status + ", expected 403");
  }

  process.stdout.write("PASS: tenant A reads its own customer only.\n");
  process.stdout.write("PASS: tenant A cannot select tenant B through the HTTP API.\n");
}

main()
  .catch((error) => {
    process.stderr.write(String(error instanceof Error ? error.stack ?? error.message : error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (created.customerIds.length) await db.customer.deleteMany({ where: { id: { in: created.customerIds } } });
    if (created.organizationIds.length) await db.organizationMembership.deleteMany({ where: { organizationId: { in: created.organizationIds } } });
    if (created.organizationIds.length) await db.organization.deleteMany({ where: { id: { in: created.organizationIds } } });
    if (created.userIds.length) await db.user.deleteMany({ where: { id: { in: created.userIds } } });
    await db.$disconnect();
  });
