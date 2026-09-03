-- FILE: infra/migrations/008_asha.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.8
-- STATUS: COMPLETE - do not modify

CREATE TABLE household_visits (
  visit_id       uuid PRIMARY KEY,        -- client-generated
  asha_id        uuid NOT NULL REFERENCES users(user_id),
  village_id     uuid NOT NULL REFERENCES villages(village_id),
  household_code text NOT NULL,           -- local register code, NOT a name
  visited_at     timestamptz NOT NULL,
  members_seen   smallint NOT NULL CHECK (members_seen BETWEEN 0 AND 50),
  danger_signs   text[] NOT NULL DEFAULT '{}',
  referral_made  boolean NOT NULL DEFAULT false,
  findings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes          text CHECK (notes IS NULL OR length(notes) <= 2000),
  -- last-write-wins guard for offline edits, see plan 10.5
  entity_version integer NOT NULL DEFAULT 1,
  device_id      text REFERENCES devices(device_id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visits_asha_idx    ON household_visits (asha_id, visited_at DESC);
CREATE INDEX visits_village_idx ON household_visits (village_id, visited_at DESC);

CREATE TRIGGER visits_updated BEFORE UPDATE ON household_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
