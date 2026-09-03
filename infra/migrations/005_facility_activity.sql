-- FILE: infra/migrations/005_facility_activity.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.5
-- STATUS: COMPLETE - do not modify
--
-- Activity is APPEND-ONLY. Nothing is ever updated or deleted. That makes sync
-- commutative: duplicated or out-of-order signals converge to the same
-- last_confirmed_at, which is what makes the offline story sound.

CREATE TABLE signal_types (
  signal_type text PRIMARY KEY,
  label       text NOT NULL,
  confirms    boolean NOT NULL   -- true = evidence of activity, false = negative evidence
);

INSERT INTO signal_types (signal_type, label, confirms) VALUES
  ('STAFF_PRESENT',     'Staff present',          true),
  ('FACILITY_OPEN',     'Facility open',          true),
  ('MEDICINE_IN_STOCK', 'Medicines available',    true),
  ('REFERRAL_ACCEPTED', 'Referral accepted here', true),
  ('FACILITY_CLOSED',   'Found closed',           false),
  ('STOCK_OUT',         'Medicines unavailable',  false);

CREATE TABLE facility_activity (
  activity_id  uuid PRIMARY KEY,          -- client-generated => idempotent insert
  facility_id  uuid NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
  signal_type  text NOT NULL REFERENCES signal_types(signal_type),
  observed_at  timestamptz NOT NULL,      -- when the ASHA saw it, NOT when it synced
  submitted_by uuid REFERENCES users(user_id) ON DELETE SET NULL,
  device_id    text REFERENCES devices(device_id) ON DELETE SET NULL,
  note         text CHECK (note IS NULL OR length(note) <= 500),
  received_at  timestamptz NOT NULL DEFAULT now(),
  -- device clocks are wrong; tolerate mild skew but reject nonsense
  CHECK (observed_at <= now() + interval '1 day')
);

CREATE INDEX activity_facility_idx ON facility_activity (facility_id, observed_at DESC);

-- GREATEST() makes a late-arriving OLDER signal harmless: freshness only ever
-- moves forward.
CREATE OR REPLACE FUNCTION bump_facility_freshness() RETURNS trigger AS $$
DECLARE is_confirm boolean;
BEGIN
  SELECT confirms INTO is_confirm FROM signal_types WHERE signal_type = NEW.signal_type;

  IF is_confirm THEN
    UPDATE facilities
       SET last_confirmed_at = GREATEST(COALESCE(last_confirmed_at, NEW.observed_at), NEW.observed_at)
     WHERE facility_id = NEW.facility_id;
  ELSE
    UPDATE facilities
       SET last_negative_at = GREATEST(COALESCE(last_negative_at, NEW.observed_at), NEW.observed_at)
     WHERE facility_id = NEW.facility_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_bumps_freshness AFTER INSERT ON facility_activity
  FOR EACH ROW EXECUTE FUNCTION bump_facility_freshness();
