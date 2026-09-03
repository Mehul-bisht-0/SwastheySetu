-- FILE: infra/migrations/001_extensions.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.1
-- STATUS: COMPLETE - do not modify
--
-- Migrations are forward-only and applied in filename order by
-- apps/api/src/db/migrate.ts, which records each applied file in schema_migrations.
-- NEVER edit an applied migration. Add a new numbered file instead.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Shared trigger function: keeps updated_at honest without trusting call sites.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: gen_random_uuid() is built into Postgres 13+. pgcrypto is not needed.
