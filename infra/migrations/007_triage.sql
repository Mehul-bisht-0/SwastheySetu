-- FILE: infra/migrations/007_triage.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.7
-- STATUS: COMPLETE - do not modify
--
-- Triage reports are IMMUTABLE. Insert-only, ON CONFLICT DO NOTHING.
--
-- classifier_features is stored alongside the outcome on purpose: it is what
-- makes the Layer-2 upgrade path real. Export these rows later, label them,
-- train a model, and swap the implementation behind the same interface.

CREATE TABLE triage_reports (
  report_id  uuid PRIMARY KEY,           -- client-generated => idempotent
  device_id  text REFERENCES devices(device_id)  ON DELETE SET NULL,
  village_id uuid REFERENCES villages(village_id) ON DELETE SET NULL,

  -- Patient snapshot: deliberately minimal. No name, no phone, no household id.
  age_months       integer NOT NULL CHECK (age_months BETWEEN 0 AND 1500),
  sex              text NOT NULL CHECK (sex IN ('male','female','other','unknown')),
  pregnancy_status text NOT NULL CHECK (pregnancy_status IN ('yes','no','unknown')),

  symptom_codes text[] NOT NULL,
  answers       jsonb  NOT NULL DEFAULT '{}'::jsonb,

  tier            text NOT NULL CHECK (tier IN ('EMERGENCY','GO_NOW','PHC_SOON','SELF_CARE')),
  decision_source text NOT NULL CHECK (decision_source IN ('RED_FLAG','CLASSIFIER')),
  red_flag_ids    text[] NOT NULL DEFAULT '{}',

  classifier_score    numeric(6,3),
  classifier_features jsonb,

  -- Versions are mandatory: a stored result means nothing without the rules
  -- that produced it.
  ruleset_version    text NOT NULL,
  classifier_version text,

  evaluated_offline boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL,   -- device clock
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX triage_reports_created_idx ON triage_reports (received_at DESC);
CREATE INDEX triage_reports_tier_idx    ON triage_reports (tier, received_at DESC);
