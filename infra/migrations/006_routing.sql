-- FILE: infra/migrations/006_routing.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.6
-- STATUS: COMPLETE - do not modify
--
-- Precomputed OSRM results. At request time a recommendation is an INDEX SCAN
-- against this table - never a live route calculation.

CREATE TABLE travel_times (
  village_id      uuid NOT NULL REFERENCES villages(village_id)   ON DELETE CASCADE,
  facility_id     uuid NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
  travel_seconds  integer NOT NULL CHECK (travel_seconds  >= 0),
  distance_meters integer NOT NULL CHECK (distance_meters >= 0),
  -- 'ESTIMATED' rows come from the great-circle fallback and MUST be surfaced
  -- in the UI as estimates, not measured road routes. See plan 9.4
  source          text NOT NULL CHECK (source IN ('OSRM','ESTIMATED')),
  osrm_profile    text,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (village_id, facility_id)
);

-- THE runtime access path. EXPLAIN must show an index scan here, not a seq scan.
CREATE INDEX travel_times_lookup ON travel_times (village_id, travel_seconds);
