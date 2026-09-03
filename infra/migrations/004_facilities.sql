-- FILE: infra/migrations/004_facilities.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.4
-- STATUS: COMPLETE - do not modify

-- Capability vocabulary. label/description drive UI copy, so the app never
-- hardcodes a capability string.
--
-- THIS LIST IS THE CANONICAL VOCABULARY AND IT IS MIRRORED IN CODE at
-- packages/core/src/facilities/capability.ts (`CAP`). The two must stay
-- identical: the trigger below rejects any tag not listed here, and the ranking
-- filter silently matches nothing if a code is spelled differently. If you add a
-- code, add it in both places in the same commit.
--
-- The first nine are the ones v1 ranking actually filters on. The rest are
-- descriptive attributes shown on the facility card but never used as a gate.
CREATE TABLE capability_codes (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  description text NOT NULL
);

INSERT INTO capability_codes (code, label, description) VALUES
  -- used as hard filters by requiredCapability()
  ('EMERGENCY_24X7', 'Emergency, 24 hours', 'Emergency care staffed around the clock'),
  ('DELIVERY',       'Childbirth',          'Conducts normal deliveries'),
  ('CAESAREAN',      'Surgical delivery',   'Can perform a caesarean section'),
  ('NEWBORN_CARE',   'Newborn care',        'Trained and equipped for sick newborns'),
  ('PAEDIATRIC',     'Child care',          'Trained in child illness management'),
  ('INPATIENT',      'Admission',           'Can admit patients overnight'),
  ('LAB_BASIC',      'Basic tests',         'Basic diagnostics on site'),
  ('PHARMACY',       'Medicines',           'Dispenses medicines on site'),
  ('AMBULANCE',      'Ambulance',           'Ambulance stationed or callable'),
  -- descriptive only: displayed, never filtered on in v1
  ('OPD',            'Outpatient care',     'Routine consultation'),
  ('OXYGEN',         'Oxygen',              'Oxygen available on site'),
  ('BLOOD_BANK',     'Blood',               'Blood storage or bank'),
  ('ICU',            'Critical care',       'Intensive care beds');

CREATE TABLE facilities (
  facility_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  facility_type    text NOT NULL CHECK (facility_type IN
                     ('SUBCENTRE','PHC','CHC','SDH','DH','PRIVATE_CLINIC')),
  -- ordinal escalation ladder: SUBCENTRE 1, PHC 2, CHC 3, SDH 4, DH 5
  capability_level smallint NOT NULL CHECK (capability_level BETWEEN 1 AND 5),
  capability_tags  text[] NOT NULL DEFAULT '{}',   -- validated by trigger below
  district_code    text NOT NULL REFERENCES districts(district_code),
  latitude         double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude        double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geom             geography(Point,4326) NOT NULL,
  phone            text,
  external_abdm_id text UNIQUE,                    -- HFR id when known

  -- DERIVED COLUMNS. Never written directly by application code -
  -- only by the trigger in 005_facility_activity.sql
  last_confirmed_at timestamptz,
  last_negative_at  timestamptz,

  is_demo_data     boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX facilities_geom_gix   ON facilities USING GIST (geom);
CREATE INDEX facilities_district_idx ON facilities (district_code);
CREATE INDEX facilities_caps_gin   ON facilities USING GIN (capability_tags);
-- supports the /sync/pull tuple cursor (see 10.4)
CREATE INDEX facilities_pull_cursor ON facilities (updated_at, facility_id);

CREATE TRIGGER facilities_updated BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Derives geom from lat/lon so the two can never drift apart, and rejects
-- unknown capability tags.
-- ST_MakePoint takes LONGITUDE FIRST. This is the single most common bug in
-- this schema; centralising it here means it can only be got wrong once.
CREATE OR REPLACE FUNCTION facilities_sync_geom() RETURNS trigger AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;

  IF EXISTS (
    SELECT 1 FROM unnest(NEW.capability_tags) AS t
    WHERE t NOT IN (SELECT code FROM capability_codes)
  ) THEN
    RAISE EXCEPTION 'unknown capability tag in %', NEW.capability_tags;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facilities_geom BEFORE INSERT OR UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION facilities_sync_geom();
