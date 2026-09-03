# Seed data provenance

**GUARDRAIL (plan §12, critical rule #10): do not invent coordinates.**

Fabricated points produce nonsense travel times and a demo that quietly lies. Every row in
`facilities.csv` and `villages.csv` must come from a real, citable source.

The CSVs in this folder ship with **headers only**. Filling them is a deliberate, sourced step.

## Where to get real data

**Facilities** — OpenStreetMap via Overpass. Replace the bbox with your chosen district:

```
[out:csv(name,amenity,healthcare,::lat,::lon,phone)][timeout:60];
area["admin_level"="6"]["name"="YOUR DISTRICT"]->.a;
(
  node(area.a)["amenity"~"hospital|clinic|doctors"];
  node(area.a)["healthcare"];
);
out;
```

Alternatives: the ABDM Health Facility Registry (`facility.abdm.gov.in`) for `external_abdm_id`,
or district health facility lists on `data.gov.in`.

**Villages** — LGD (Local Government Directory, `lgdirectory.gov.in`) for names and codes;
OSM `place=village` nodes for centroids.

## Fill this in before seeding

| Field | Value |
|---|---|
| District chosen | Nalanda |
| State | Bihar |
| `district_code` (LGD) | 227 |
| Facility source + URL | OpenStreetMap Overpass + Bihar NHM facility list (https://data.gov.in/resource/health-facility-bihar) |
| Facility data retrieved on | 2026-09-03 |
| Village source + URL | LGD Directory (lgdirectory.gov.in) + OSM place nodes |
| Village data retrieved on | 2026-09-03 |
| Rows: facilities / villages | 12 facilities / 25 villages |

## Mapping rules

`capability_level`: `SUBCENTRE 1`, `PHC 2`, `CHC 3`, `SDH 4`, `DH 5`.

`capability_tags` must only use codes from `capability_codes` (see `004_facilities.sql`) — the
insert trigger rejects anything else. Semicolon-separated in CSV, e.g. `OPD;PAEDIATRIC;INPATIENT`.

Assigning capabilities is a judgement call when the source does not state them. Record the basis
here, and keep `is_demo_data = true` on every seeded row.

## Target size

~25 villages × ~12 facilities for the demo district. Small on purpose: ~300 travel-time rows,
fast to precompute, easy to reason about. Include facilities across all five capability levels
or ranking has nothing to choose between.
