-- FILE: infra/migrations/003_geography.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.3
-- STATUS: COMPLETE - do not modify
--
-- geography(Point,4326) NOT geometry: ST_Distance then returns METRES.
-- With geometry it returns degrees, which look like plausible small numbers -
-- that is what makes the mistake expensive.

CREATE TABLE districts (
  district_code text PRIMARY KEY,      -- LGD district code
  name          text NOT NULL,
  state_name    text NOT NULL,
  is_demo_data  boolean NOT NULL DEFAULT true
);

CREATE TABLE villages (
  village_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_code text NOT NULL REFERENCES districts(district_code),
  name          text NOT NULL,
  lgd_code      text,
  centroid      geography(Point,4326) NOT NULL,
  population    integer,
  is_demo_data  boolean NOT NULL DEFAULT true,
  UNIQUE (district_code, name)
);

CREATE INDEX villages_centroid_gix ON villages USING GIST (centroid);
CREATE INDEX villages_district_idx ON villages (district_code);
