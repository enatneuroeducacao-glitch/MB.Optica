-- Regression test against the real Prisma schema after migrations are applied in CI.
-- This test runs inside a transaction and never touches production data.
BEGIN;

INSERT INTO "Organization" ("id", "name", "slug", "updatedAt") VALUES
  ('tenant-test-a', 'Tenant Test A', 'tenant-test-a', NOW()),
  ('tenant-test-b', 'Tenant Test B', 'tenant-test-b', NOW());

INSERT INTO "Customer" ("id", "name", "organizationId", "createdAt", "updatedAt") VALUES
  ('customer-test-a', 'Customer A', 'tenant-test-a', NOW(), NOW()),
  ('customer-test-b', 'Customer B', 'tenant-test-b', NOW(), NOW());

-- Same-tenant relationship must succeed.
INSERT INTO "Address" ("id", "customerId", "organizationId")
VALUES ('address-test-a', 'customer-test-a', 'tenant-test-a');

-- A tenant-A child must not reference a tenant-B parent.
DO $$
BEGIN
  BEGIN
    INSERT INTO "Address" ("id", "customerId", "organizationId")
    VALUES ('address-cross-tenant', 'customer-test-b', 'tenant-test-a');
    RAISE EXCEPTION 'SECURITY TEST FAILED: cross-tenant customer relation was accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: cross-tenant customer relation rejected by application schema';
  END;
END $$;

-- Nullable organizationId remains an intentional rollout gap: PostgreSQL MATCH SIMPLE
-- permits a composite FK check to be skipped when one referencing component is NULL.
-- This assertion documents that limitation until backfill + NOT NULL is approved.
INSERT INTO "Address" ("id", "customerId", "organizationId")
VALUES ('address-null-scope-gap', 'customer-test-b', NULL);

ROLLBACK;
