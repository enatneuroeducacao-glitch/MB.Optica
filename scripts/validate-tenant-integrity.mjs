import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  "prisma/migrations/20261111130000_add_composite_tenant_foreign_keys/migration.sql",
  "utf8"
);
const schema = readFileSync("prisma/schema.prisma", "utf8");

const uniqueIndexes = [...migration.matchAll(/CREATE UNIQUE INDEX "([^"]+_id_organizationId_key)" ON "([^"]+)"\("id", "organizationId"\);/g)];
const compositeFks = [...migration.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)"\("id", "organizationId"\)/g)];

assert.equal(uniqueIndexes.length, 45, "Expected composite unique indexes for all tenant-scoped models");
assert.equal(compositeFks.length, 51, "Expected composite foreign keys for all tenant-to-tenant relations");
for (const [, , table] of uniqueIndexes) {
  assert.match(schema, new RegExp("model\\s+" + table + "\\s+\\{[\\s\\S]*?@@unique\\(\\[id, organizationId\\]\\)"));
}
for (const [, child, , fields] of compositeFks) {
  assert.match(fields, /organizationId/, child + " FK must include organizationId");
}
assert.match(migration, /FOREIGN KEY \("customerId", "organizationId"\) REFERENCES "Customer"\("id", "organizationId"\)/);
assert.match(migration, /FOREIGN KEY \("productId", "organizationId"\) REFERENCES "Product"\("id", "organizationId"\)/);
assert.match(migration, /FOREIGN KEY \("saleId", "organizationId"\) REFERENCES "Sale"\("id", "organizationId"\)/);
console.log("PASS: 45 tenant composite keys and 51 composite foreign keys are present.");
