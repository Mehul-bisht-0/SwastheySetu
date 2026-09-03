-- FILE: infra/migrations/002_identity.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.2
-- STATUS: COMPLETE - do not modify
--
-- There is deliberately NO citizen user table. The citizen triage flow is
-- anonymous: less PII to protect, and no login standing between a worried
-- parent and an urgency answer.

CREATE TABLE users (
  user_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('ASHA','SUPERVISOR','ADMIN')),
  password_hash text NOT NULL,
  district_code text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per physical device, so sync can be reasoned about per-device.
CREATE TABLE devices (
  device_id    text PRIMARY KEY,   -- client-generated, stable, opaque
  user_id      uuid REFERENCES users(user_id) ON DELETE SET NULL,
  platform     text NOT NULL CHECK (platform IN ('android','ios','unknown')),
  app_version  text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devices_user_idx ON devices (user_id);
