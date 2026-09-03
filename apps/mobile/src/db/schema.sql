-- ═══════════════════════════════════════════════════════════════════════════
-- FILE: apps/mobile/src/db/schema.sql
-- PLAN: IMPLEMENTATION_PLAN.md §12.5
-- STATUS: COMPLETE — do not modify. Applied verbatim by src/db/client.ts.
-- PHASE: 8
--
-- The on-phone database. expo-sqlite, one file, no migrations framework: the
-- whole schema is created with IF NOT EXISTS on every launch, and `user_version`
-- gates anything destructive.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE RULE THIS SCHEMA EXISTS TO ENFORCE
--
--   A write that an ASHA has made is DURABLE THE MOMENT SHE TAPS SAVE, and it
--   leaves this database only when the server has acknowledged it by name.
--
--   Everything below follows from that: the outbox holds the client-generated
--   op id, the local row and its outbox entry are written in ONE transaction,
--   and nothing is deleted on a guess.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY ABSENT
--
--   · No patient name, no phone number, no address, anywhere in this file. A
--     field phone is lost, shared and resold. It holds household codes and
--     coded symptoms, and that is all it can leak.
--   · No auth token. That lives in expo-secure-store (Keystore/Keychain), not
--     in a SQLite file that any backup tool will happily copy off the device.
--   · No clinical thresholds. The rules live in packages/core and are read from
--     there at runtime, so the phone and the server can never disagree about
--     what counts as an emergency.
-- ═══════════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ───────────────────────────────────────────────────────────── app_meta
-- Key/value scratchpad that must survive a cold start. Small, and read on
-- almost every screen, so it stays a single table rather than several.
--
-- Keys in use:
--   locale              'hi' | 'en'
--   sync.pullCursor     opaque cursor from the last successful GET /sync/pull
--   sync.lastPushAt     ISO timestamp of the last successful push
--   sync.lastPullAt     ISO timestamp of the last successful pull
--   session.ashaId      uuid of the signed-in worker (NOT the token)
--   session.district    district code, used to scope the cached facility list
--   ruleset.version     ruleset the last local evaluation used, for support
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────── outbox
-- THE MOST IMPORTANT TABLE IN THE MOBILE APP.
--
-- One row per pending write. `client_op_id` is a UUID v4 generated on THIS
-- device before the write is attempted, and it is what makes a retry safe: the
-- server stores it, so a batch that is sent twice is applied once
-- (apps/api/src/modules/sync/repo.ts).
--
-- LIFECYCLE — a row is removed on exactly two server verdicts:
--   APPLIED    the server wrote it            → DELETE the row
--   DUPLICATE  the server already had it      → DELETE the row
--   REJECTED   permanently invalid            → keep, status='REJECTED', show
--              it to the worker. Retrying a rejected op forever is how a queue
--              becomes a poison pill that blocks everything behind it.
--   (no reply / 5xx / timeout)                → keep, status='PENDING',
--              increment attempts, back off. NEVER delete on a network error.
--
-- `payload` is the exact JSON that will be sent. It is built once, at save
-- time, and never regenerated — if it were rebuilt at send time from the local
-- row, its hash would change and the server's duplicate check would miss.
CREATE TABLE IF NOT EXISTS outbox (
  client_op_id      TEXT PRIMARY KEY,
  op_type           TEXT NOT NULL CHECK (op_type IN (
                      'TRIAGE_REPORT_CREATE',
                      'HOUSEHOLD_VISIT_UPSERT',
                      'FACILITY_SIGNAL_CREATE')),
  payload           TEXT NOT NULL,
  client_created_at TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'SENDING', 'REJECTED')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_attempt_at   TEXT,
  last_error        TEXT
);

-- Send oldest first: a queue that reorders itself is impossible to reason about
-- when a worker asks why yesterday's visit has not gone.
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox (status, client_created_at);

-- ─────────────────────────────────────────────────── triage_reports_local
-- Every evaluation done on this phone, whether or not it has been sent.
--
-- `result_json` stores the tier the phone decided AT THE TIME. The server
-- re-evaluates on receipt and stores its own result; if the two disagree the
-- server logs a warning and keeps both, because a mismatch means the device is
-- running an old ruleset and that is a fact worth knowing, not an error worth
-- rejecting the report over.
CREATE TABLE IF NOT EXISTS triage_reports_local (
  report_id       TEXT PRIMARY KEY,
  village_id      TEXT,
  encounter_json  TEXT NOT NULL,
  result_json     TEXT NOT NULL,
  -- Exactly `UrgencyTier` from packages/core/src/triage/types.ts, in the same
  -- order. Migration 007_triage.sql constrains the server column to the same
  -- four values; if these two lists ever diverge, a row that saves on the
  -- phone is rejected by the server and the worker is told nothing useful.
  tier            TEXT NOT NULL CHECK (tier IN (
                    'EMERGENCY', 'GO_NOW', 'PHC_SOON', 'SELF_CARE')),
  ruleset_version TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  -- 1 while the matching outbox row exists; cleared by the sync runner.
  pending         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS triage_reports_local_created_idx
  ON triage_reports_local (created_at DESC);

-- ─────────────────────────────────────────────────── household_visits_local
-- `entity_version` is what makes the server-side upsert deterministic: it is
-- incremented on every local edit, and the server keeps the row only when the
-- incoming version is HIGHER than the stored one. Two phones editing the same
-- household therefore converge instead of clobbering each other, and the loser
-- gets a VERSION_CONFLICT it can show to the worker.
CREATE TABLE IF NOT EXISTS household_visits_local (
  visit_id       TEXT PRIMARY KEY,
  household_code TEXT NOT NULL,
  village_id     TEXT NOT NULL,
  visited_at     TEXT NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  payload_json   TEXT NOT NULL,
  pending        INTEGER NOT NULL DEFAULT 1,
  -- Set when the server refuses the write. Shown in the queue screen so the
  -- worker knows something needs her attention rather than silently vanishing.
  conflict       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS household_visits_local_visited_idx
  ON household_visits_local (visited_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS household_visits_local_household_idx
  ON household_visits_local (village_id, household_code);

-- ─────────────────────────────────────────────────────── facilities_cache
-- Pulled down by GET /sync/pull and read offline. Scoped to one district: a
-- national dataset must never be bundled into or downloaded onto the phone.
--
-- `capability_tags` is a comma-separated list rather than a join table. It is
-- read whole, filtered in JS by packages/core, and never queried by tag in SQL,
-- so a second table would buy nothing and cost a join on a slow device.
--
-- THE COLUMN LIST IS DICTATED BY `FacilityCandidate` in
-- packages/core/src/facilities/types.ts. Every field the ranker reads has to be
-- here, in the same units, or the DAO ends up converting on the way out - and a
-- unit conversion between a store and a ranker is where a 60x error hides.
CREATE TABLE IF NOT EXISTS facilities_cache (
  facility_id      TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,
  district_code    TEXT NOT NULL,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL,
  -- 1 = sub-centre ... 5 = medical college. The hard filter in rank.ts compares
  -- against MIN_LEVEL_BY_TIER, so a missing level would let an emergency be
  -- routed to a sub-centre.
  capability_level INTEGER NOT NULL,
  capability_tags  TEXT NOT NULL DEFAULT '',
  phone            TEXT,
  -- Server's freshness snapshot at pull time, carried so the phone can show
  -- the same wording offline. Recomputed against the CURRENT clock on display,
  -- because a snapshot that says "confirmed 2 days ago" must age to "9 days"
  -- while the phone is offline rather than staying frozen at 2.
  last_confirmed_at TEXT,
  -- The most recent "it was not working" report. Without this column the phone
  -- can never reach the REPORTED_CLOSED band offline, which means negative
  -- evidence would be visible online and invisible in exactly the situation the
  -- app was built for.
  last_negative_at  TEXT,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS facilities_cache_district_idx
  ON facilities_cache (district_code);

-- ───────────────────────────────────────────────────────── villages_cache
CREATE TABLE IF NOT EXISTS villages_cache (
  village_id    TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  district_code TEXT NOT NULL,
  lat           REAL NOT NULL,
  lon           REAL NOT NULL
);

-- ────────────────────────────────────────────────────── travel_times_cache
-- Precomputed village→facility travel times from infra/routing/precompute.ts.
--
-- THE PHONE NEVER CALLS A ROUTING SERVICE. It has no network by assumption and
-- OSRM is a build-time tool. When a pair is missing here, ranking falls back to
-- straight-line distance and the UI says "distance only" rather than inventing
-- a travel time.
-- Units and column names match `FacilityCandidate` and the `travelTime` schema
-- in packages/contracts/src/sync.ts exactly: seconds and metres, never minutes
-- and kilometres.
CREATE TABLE IF NOT EXISTS travel_times_cache (
  village_id     TEXT NOT NULL,
  facility_id    TEXT NOT NULL,
  travel_seconds INTEGER NOT NULL,
  distance_meters INTEGER NOT NULL,
  -- 'ESTIMATED' means no road route was available and this is straight-line.
  -- It must reach the screen as an estimate; see rank.ts `travelEstimated`.
  source         TEXT NOT NULL CHECK (source IN ('OSRM', 'ESTIMATED')),
  PRIMARY KEY (village_id, facility_id)
);

-- ──────────────────────────────────────────────────────── signals_local
-- Facility reports made by this device, kept so the worker can see what she
-- submitted. The authoritative copy is on the server.
CREATE TABLE IF NOT EXISTS signals_local (
  signal_id      TEXT PRIMARY KEY,
  facility_id    TEXT NOT NULL,
  signal_type    TEXT NOT NULL,
  capability_tag TEXT,
  observed_at    TEXT NOT NULL,
  pending        INTEGER NOT NULL DEFAULT 1
);

-- ───────────────────────────────────────────────────────────────────────────
-- Bump only when a change requires code to migrate existing rows. Adding a
-- table above is handled by IF NOT EXISTS and needs no bump.
PRAGMA user_version = 1;
