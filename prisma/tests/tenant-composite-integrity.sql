-- Isolated PostgreSQL regression test for tenant-composite foreign keys.
-- This test uses temporary tables and never touches application or production data.
BEGIN;
CREATE TEMP TABLE tenant_fixture_parent (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (id, organization_id)
);
CREATE TEMP TABLE tenant_fixture_child (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  CONSTRAINT tenant_fixture_child_parent_org_fkey
    FOREIGN KEY (parent_id, organization_id)
    REFERENCES tenant_fixture_parent (id, organization_id)
);
INSERT INTO tenant_fixture_parent (id, organization_id) VALUES
  ('parent-a', 'org-a'),
  ('parent-b', 'org-b');
-- Same-tenant relationship must succeed.
INSERT INTO tenant_fixture_child (id, parent_id, organization_id)
VALUES ('child-a', 'parent-a', 'org-a');
-- Cross-tenant relationship must fail with a foreign-key violation.
DO $$
BEGIN
  BEGIN
    INSERT INTO tenant_fixture_child (id, parent_id, organization_id)
    VALUES ('child-cross', 'parent-b', 'org-a');
    RAISE EXCEPTION 'SECURITY TEST FAILED: cross-tenant relation was accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: cross-tenant relation rejected';
  END;
END $$;
ROLLBACK;
