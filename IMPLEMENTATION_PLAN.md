# SwasthyaSetu — Implementation Plan

**Offline-first rural healthcare decision support.** A prototype, not a product, and explicitly
not clinically validated.

This document is the specification. `AGENTS.md` is the shorter operating manual for whoever is
writing the code; read that first, then use this for detail. Every source file in the repository
carries a `PLAN:` header pointing at a section number here, so the numbering below is load-bearing
and must not be renumbered.

---

## 1. What this is, and what it is not

A woman in a village 40 km from the nearest functioning hospital has a sick child at two in the
morning. She has a cheap Android phone with no signal. She needs two answers: **how soon does this
need care**, and **where should we actually go**. Getting the first wrong kills people in both
directions — panic that empties a household's savings on a needless night journey, or reassurance
that delays a real emergency. Getting the second wrong sends a patient to a facility that cannot
treat them, which costs a second journey they may not survive.

SwasthyaSetu answers those two questions on the device, with the radio off, using deterministic
rules that a human being can read and audit.

**It is not a diagnosis tool.** It never names a disease. It reports urgency and destination.
That is a smaller claim than most health apps make and it is the only claim this system can
support honestly.

### 1.1 What v1 contains

| Built in v1 | Deferred |
|---|---|
| Deterministic triage engine, runs on phone and server from one source | RAG / knowledge retrieval (§13) |
| Facility ranking with capability filtering and evidence-age weighting | Live facility status feeds |
| Offline SQLite store with a durable outbox and idempotent sync | Multi-district scale, national datasets |
| ASHA worker auth and household visit capture | SMS/phone-line IVR fallback, speech input |
| In-app spoken prompts with numbered keypad answers | Telecom-provider integration |
| Postgres + PostGIS backend, precomputed travel times | Real-time routing at request time |

### 1.2 The ten guardrails

These are numbered because files refer to them by number. They are constraints, not preferences.

1. **The LLM is never the triage engine.** Urgency comes from rules in `packages/core`.
2. **RAG never determines facility availability.** Retrieval answers "what does approved guidance
   say", never "is this hospital open".
3. **Never claim a facility is open.** The backend knows when somebody last reported something.
   State the evidence and its age; never the present-tense status. (§6.7, §12.11)
4. **Never present the system as diagnostic.** No disease names anywhere in output.
5. **Never assume the network.** Every clinical path works in airplane mode.
6. **Never bundle national-scale data into the phone.** The device caches one district.
7. **No model credential ever reaches the mobile bundle.** Enforced by
   `scripts/check-no-secrets.mjs`, which fails `npm run verify`. (§14.3)
8. **The classifier never runs after a red flag fires.** A scoring model must not be able to
   talk the system down from an emergency. (§6.5)
9. **No infrastructure before the vertical slice works.** Queues, caches and dashboards come
   after a patient can be triaged end to end.
10. **Never represent clinical validation as done.** `README.md` keeps an accurate
    implemented-vs-planned table and `docs/SAFETY.md` records that no clinician has reviewed the
    rules. This statement is not to be softened. (§14.4)

---

## 2. Architecture — three engines that never trade places

The single most important structural rule in the system:

| Engine | Lives in | Answers | Must never |
|---|---|---|---|
| **Decision** | `packages/core/src/triage` | How urgent is this? | Know about facilities, networks or models |
| **Routing** | `packages/core/src/facilities`, `apps/api/src/modules/routing` | Where should this person go? | Change the urgency it was given |
| **Knowledge** | `apps/api/src/modules/rag` (not in v1) | What does approved guidance say? | Decide urgency or assert availability |

Decision runs first and its output is an input to Routing. Knowledge is downstream of both and is
never on the critical path — if it fails, the user still gets a tier and a destination.

The reason for the separation is auditability. When a triage result is wrong, someone must be
able to point at the rule that produced it and change that rule. A model that produced it by
inference cannot be corrected, only retrained and hoped about.

### 2.1 One copy of the clinical logic

`packages/core` has **zero dependencies** — no npm packages, no `node:*` imports, no `fetch`, no
`process`, and no `Date.now()` inside a pure function (a clock is passed in; see
`packages/core/src/util/clock.ts`). It therefore runs unchanged in three places: the Fastify
server, the Expo bundle via Metro, and `node --test`.

That constraint exists so the phone and the server can never disagree about what counts as an
emergency. If the device is running an older ruleset, the server records the mismatch as a fact
worth knowing rather than rejecting the report (§10.3).

### 2.2 Request flow

```
citizen/ASHA taps through symptoms
        │
        ▼
  evaluateTriage(encounter, now)          ← packages/core, on the phone
        │  { tier, reasons, rulesetVersion }
        ▼
  requiredCapability(encounter, result)   ← packages/core
        │  { minLevel, requiredTags }
        ▼
  rankFacilities(cached, req, tier, now)  ← packages/core, over the SQLite cache
        │
        ▼
  screen renders tier banner + ranked list + freshness chips
        │
        ▼
  outbox row written in the SAME transaction as the local record
        │  ...later, when there is signal...
        ▼
  POST /sync/push  →  server re-evaluates, stores both results, replies per op
```

The network appears exactly three times in that diagram, all after the answer has been given:
first sign-in, sending the outbox, refreshing the facility cache.

---

## 3. Repository layout and conventions

```
packages/core          the decision + routing engines. zero dependencies.
packages/contracts     zod schemas shared by API and mobile. the wire format.
apps/api               fastify server, postgres, the only place a model key exists
apps/mobile            expo app. NOT an npm workspace — see §12.0
infra                  docker compose, SQL migrations, seed loader, OSRM precompute
scripts                verification scripts run by `npm run verify`
docs                   ARCHITECTURE, SAFETY, DEMO
tests/scenarios        end-to-end fixture cases
```

### 3.1 File header protocol

Every file opens with a header naming its path, its plan section, its status and its phase. The
`STATUS:` line is an instruction:

- `COMPLETE — do not modify` — this file *is* the specification. SQL migrations, type
  definitions, the red-flag ruleset, design tokens, i18n strings and all tests are pre-written.
  If your code disagrees with a COMPLETE file, your code is wrong.
- `STUB — implement the function bodies` — signatures and numbered steps are given; write the
  bodies, do not change exported signatures.
- `SCAFFOLD — replace placeholder content` — mostly screens; structure sketched, build it out.

Every stub body throws `NOT_IMPLEMENTED: <name> — see doc comment`. Typecheck passes, runtime
fails loudly, and nothing silently returns a wrong medical answer.

### 3.2 Relative imports end in `.ts`

Node 22 runs TypeScript by stripping types and executing what is left. There is no emitted `.js`,
so `./redFlags.js` resolves to nothing, and `module: "NodeNext"` rejects extensionless specifiers.
`.ts` is the only spelling that works. `allowImportingTsExtensions`,
`rewriteRelativeImportExtensions` and `emitDeclarationOnly` in `tsconfig.base.json` make it legal
while keeping declarations correct.

`erasableSyntaxOnly: true` is on for the same reason: `enum`, `namespace` and constructor
parameter properties cannot be erased by a type stripper. Use a `const` object with `as const`
(see `CAP` in `packages/core/src/facilities/capability.ts`).

`noUncheckedIndexedAccess: true` means `arr[0]` is `T | undefined`. Bind, assert, then use.

### 3.3 Vocabularies that must not fork

Three enumerations appear in the engine, the database, the contracts and the phone. They are
written out here because every previous bug in this skeleton has been a copy of one of them
drifting:

| Vocabulary | Canonical source | Also appears in |
|---|---|---|
| `UrgencyTier` — `EMERGENCY`, `GO_NOW`, `PHC_SOON`, `SELF_CARE` | `packages/core/src/triage/types.ts` | `007_triage.sql`, `contracts/common.ts`, mobile `schema.sql`, `theme/tokens.ts`, `i18n/strings.ts` |
| `FreshnessBand` — `FRESH`, `AGING`, `STALE`, `REPORTED_CLOSED`, `UNKNOWN` | `packages/core/src/facilities/types.ts` | API responses, `theme/tokens.ts`, `i18n/strings.ts`, `FreshnessChip.tsx` |
| `SyncOpType` — `TRIAGE_REPORT_CREATE`, `HOUSEHOLD_VISIT_UPSERT`, `FACILITY_SIGNAL_CREATE` | `packages/core/src/sync/types.ts` | `009_sync.sql`, `contracts/sync.ts`, mobile `schema.sql` |

Adding a value means changing every row of that line, in the same commit.

---

## 4. Infrastructure

### 4.1 `infra/Dockerfile.db`

No official image ships both PostGIS and pgvector. The image builds from the PostGIS base and adds
pgvector on top. PostGIS is load-bearing in v1; pgvector is not needed until RAG but the extension
is created now so the schema does not have to change later.

**This is the most likely early blocker.** Verify both `CREATE EXTENSION` calls succeed in Phase 0
before writing anything else.

### 4.2 `infra/docker-compose.yml`

Two services. `db` (Postgres, port 5432, database `swasthyasetu`, user `swasthya`) is always
needed. `osrm` sits behind the `routing` profile and is **build-time only** — it does not need to
be running for the demo, because travel times are precomputed into Postgres (§7).

Bring them up with `npm run db:up` and `npm run routing:up` respectively.

### 4.3 The migration runner — `apps/api/src/db/migrate.ts`

Plain SQL files applied in filename order, each inside a transaction, each recorded in a
`schema_migrations` table. No ORM and no migration framework: the schema is the most reviewable
artefact in the project and an ORM would hide it behind a DSL.

Migrations are append-only. To change something already applied, add a new file.

---

## 5. Database schema — `infra/migrations`

Ten migrations, all `COMPLETE`. They are the authority on shape; the API's repositories are
written to match them, never the other way round.

| § | File | Contains |
|---|---|---|
| 5.1 | `001_extensions.sql` | `postgis`, `pgcrypto`, `vector` |
| 5.2 | `002_identity.sql` | `asha_workers`, credential hashes, districts |
| 5.3 | `003_geography.sql` | `districts`, `villages`, `geography(Point,4326)` columns and GIST indexes |
| 5.4 | `004_facilities.sql` | `facilities`, `capabilities` catalogue, `facility_capabilities` |
| 5.5 | `005_facility_activity.sql` | `facility_signals` — the evidence table behind freshness |
| 5.6 | `006_routing.sql` | `travel_times` (village × facility, precomputed) |
| 5.7 | `007_triage.sql` | `triage_reports`, tier CHECK, stored encounter and result |
| 5.8 | `008_asha.sql` | `household_visits`, `entity_version` |
| 5.9 | `009_sync.sql` | `sync_operations` ledger — client op id, payload hash, stored result |
| 5.10 | `010_rag_placeholder.sql` | empty `documents` / `chunks` tables with a vector column, unused in v1 |

### 5.1 Geography conventions

Points are `geography(Point,4326)`. **`ST_MakePoint` takes longitude first.** This is the single
most common bug in PostGIS code and it produces results that look plausible — a village in
Rajasthan quietly relocated to the Bay of Bengal still returns five nearest facilities, just the
wrong five. `apps/api/test/facilities.test.ts` has a test whose entire purpose is to catch a
lat/lon swap.

Nearest-neighbour queries use the `<->` KNN operator with a GIST index. Distance filtering uses
`ST_DWithin`, which is index-assisted; `ST_Distance` in a `WHERE` clause is not.

### 5.2 Freshness is derived, never stored

`facilities` has no `is_open` column and must never acquire one. Availability is computed at read
time from `facility_signals` by §6.7. A stored boolean would be stale within hours and, worse,
would look authoritative.

---

## 6. `packages/core` — the decision engine

Zero dependencies. Pure functions. This is where the safety of the system actually lives, and it
is the right place to start work (§14.1) because it needs no database, no network and no install.

### 6.1 `triage/types.ts` — `COMPLETE`

`UrgencyTier` (four values, §3.3) and `TIER_ORDER` mapping them to `0..3` for comparison.
`Encounter` is the input: patient (`ageMonths`, `sex`, `pregnancy`), a symptom code array, and an
answers map. `TriageResult` carries the tier, the reasons that produced it, and the ruleset
version that was in force.

**`EMERGENCY` is reachable only through a red-flag rule.** The classifier cannot produce it.

### 6.2 `triage/predicate.ts` — `STUB`

The small predicate language the ruleset is written in: age windows, symptom presence, answer
comparisons, and the safety-biased helpers. `mayBePregnant` returns true for `"yes"` **and**
`"unknown"` — an unknown pregnancy is treated as a pregnancy, because the cost of the careful
branch is a conversation and the cost of the other branch is not.

### 6.3 `triage/redFlags.ts` + `ruleset.v1.ts` — rules `COMPLETE`, evaluator `STUB`

Fourteen red-flag rules, each with a stable id (`RF_UNCONSCIOUS`, `RF_CONVULSION`,
`RF_INFANT_FEVER`, `RF_CHILD_FAST_BREATHING`, `RF_PREG_BLEEDING`, `RF_STROKE_SIGNS`, …), a
predicate, a plain-language reason, and a source citation.

The rules are `COMPLETE` and are not to be tuned to make a test pass. Each one's provenance is
recorded in `docs/SAFETY.md`, along with the statement that no clinician has reviewed them.

`evaluateRedFlags` returns **every** rule that fired, not the first. A patient with three red
flags gets three reasons, and the extra ones matter to the person deciding whether to hire a
vehicle.

### 6.4 `triage/classifier.v1.ts` — `STUB`

An additive, transparent score for everything that is not a red flag. Weighted features, summed,
compared against two thresholds:

```
score >= THRESHOLD_GO_NOW   (6.0)  ->  GO_NOW
score >= THRESHOLD_PHC_SOON (2.5)  ->  PHC_SOON
otherwise                          ->  SELF_CARE
```

Boundaries are inclusive. The score is never shown to a user (§12.4, wording rule 4): it is a
number for calibrating the system offline, and on screen it would invite a precision the system
does not have.

### 6.5 `triage/evaluate.ts` — `STUB`. **GUARDRAIL 8 lives here.**

```
1. red = evaluateRedFlags(encounter)
2. if (red.length > 0) return EMERGENCY with those reasons   ← RETURN. Do not continue.
3. otherwise return classify(encounter)
```

The classifier must not run after a red flag fires. Not to adjust the result, not to add a
confidence, not to log a comparison. A scoring model that can talk the system down from an
emergency is the exact failure mode this architecture exists to prevent.

### 6.6 `facilities/capability.ts` — `STUB`

`CAP` is the tag catalogue (`EMERGENCY_24X7`, `DELIVERY`, `CAESAREAN`, `NEWBORN_CARE`,
`PAEDIATRIC`, `INPATIENT`, `LAB_BASIC`, `PHARMACY`, `AMBULANCE`) and the strings must match the
`code` column seeded by `004_facilities.sql` exactly — a typo silently filters out every facility.

`MIN_LEVEL_BY_TIER` sets the floor: `EMERGENCY` 3, `GO_NOW` 2, `PHC_SOON` 1, `SELF_CARE` 1, where
level 1 is a sub-centre and 5 a medical college.

`requiredCapability` derives the requirement: the tier floor, plus `EMERGENCY_24X7` for an
emergency, plus obstetric tags when `mayBePregnant` — and `CAESAREAN` as well when the tier is
`EMERGENCY` or `GO_NOW`. An obstetric emergency sent to a facility that cannot perform a
caesarean is a referral, meaning a second journey. Better one district hospital further, once.

### 6.7 `facilities/freshness.ts` — `STUB`. **GUARDRAIL 3 lives here.**

Confidence decays exponentially with evidence age: `exp(-ageDays / tauDays)`, `tauDays = 14`. So
a three-day-old report is worth 0.81, a fortnight-old one 0.37, a three-month-old one 0.002 —
which is correct, because it is worth almost nothing.

Bands: `FRESH` (≤3 days), `AGING` (≤14), `STALE` (older), plus two special cases.

**Negative evidence wins.** A "not working" report inside a 7-day window, and not older than the
last confirmation, produces `REPORTED_CLOSED` with confidence multiplied by 0.25. The asymmetry
is deliberate: false reassurance is the expensive error.

**Absence of evidence is `UNKNOWN` with confidence 0.1, not 0.** An unverified level-4 hospital
should still outrank a verified sub-centre for an emergency. Unknown is weak, not disqualifying.

Bad data degrades rather than throws: an unparseable timestamp is treated as absent.

### 6.8 `facilities/rank.ts` — `STUB`

Hard filters first — capability tags and minimum level are requirements, not preferences. Then a
weighted score over capability, travel time and freshness, with the profile chosen by tier:

| Tier | capability | time | freshness | max minutes |
|---|---|---|---|---|
| `EMERGENCY` | 0.55 | 0.25 | 0.20 | 120 |
| `GO_NOW` | 0.40 | 0.35 | 0.25 | 120 |
| `PHC_SOON` | 0.25 | 0.45 | 0.30 | 90 |
| `SELF_CARE` | 0.20 | 0.50 | 0.30 | 60 |

A dying patient needs the right facility; a patient with a two-day cough needs a near one.

**Fallback is explicit.** When nothing satisfies the hard filter, relax it, set
`fallbackApplied: true`, and populate `unmetRequirements` with exactly what is missing. Silently
returning the nearest facility that cannot help is the failure this field exists to prevent, and
`buildReasons` turns it into a sentence the user reads.

Ranking is deterministic and stable: the same inputs in a different order produce the same output.

---

## 7. Routing and travel-time precompute — `infra/routing/precompute.ts`

OSRM is a **build-time tool**. It runs once against a district OSM extract, computes a
village × facility matrix, and writes it into `travel_times` (§5.6). At request time — and
certainly on the phone — nothing calls a routing service.

This is a deliberate trade. Live routing would be marginally more accurate and would make the
core feature depend on a service being up, which contradicts guardrail 5. A rural road network
does not change between demos.

Where a pair is missing from the matrix, ranking falls back to straight-line distance and the UI
says "distance only". It does not invent a travel time.

---

## 8. `packages/contracts` — the wire format

Zod schemas, shared by the API and the mobile client, so that a request the phone can construct is
by construction a request the server can parse.

| § | File | Contains |
|---|---|---|
| 8.1 | `common.ts` | The response envelope, `urgencyTier`, id and timestamp primitives |
| 8.2 | `auth.ts` | Login request/response, the JWT claim shape |
| 8.3 | `triage.ts` | `Encounter` and `TriageResult` on the wire |
| 8.4 | `facilities.ts` | `nearby`, `recommend`, signal submission, the freshness block |
| 8.5 | `asha.ts` | Household visit payloads |
| 8.6 | `sync.ts` | Push batch, per-op result, pull page |

### 8.1 The envelope

Every response is `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. A 404 for an
unknown path uses the same shape — a client that has to special-case the framework's default error
body will eventually fail to parse the one error that mattered.

Codes are machine-readable and stable (`NOT_IMPLEMENTED`, `VERSION_CONFLICT`, `UNAUTHORIZED`).
Messages are for humans and may change.

---

## 9. `apps/api` — the server

Fastify. Three-layer modules, no exceptions: **`routes.ts` does HTTP, `service.ts` holds business
logic, `repo.ts` holds SQL.** A route handler containing a ranking decision or an `if` on urgency
is a bug, because it is logic the phone cannot run offline.

Every query is parameterised. String-interpolated SQL is never acceptable, including in a script,
including for an integer.

| § | Path | Notes |
|---|---|---|
| 9.1 | `app.ts`, `server.ts`, `config.ts` | Config is a zod schema over `process.env`, validated at boot |
| 9.2 | `db/pool.ts`, `db/tx.ts`, `db/migrate.ts` | One pool; `tx()` gives a callback a client and rolls back on throw |
| 9.3 | `plugins/{auth,errors,observability}.ts` | JWT verification, envelope mapping, request logging |
| 9.4 | `modules/health` | `GET /health` |
| 9.5 | `modules/auth` | `POST /auth/login` — phone + password, argon2/bcrypt hash, 30-day JWT |
| 9.6 | `modules/triage` | `POST /triage/evaluate` — calls core, stores the report |
| 9.7 | `modules/routing` | Reads `travel_times`; no OSRM at request time |
| 9.8 | `modules/facilities` | `/facilities/nearby`, `/facilities/recommend`, `POST /facilities/:id/signals` |
| 9.9 | `modules/asha` | Household visits, all routes authenticated |

### 9.1 Configuration

`config.ts` validates the environment at boot and refuses to start if it is wrong. `JWT_SECRET`
has a 32-character minimum and **no default** — a secret that silently falls back to `"dev"` is a
production incident with a plausible-looking log line. `RAG_ENABLED` defaults to false and is
coerced to a real boolean, because the string `"false"` is truthy and would advertise a feature
that does not exist.

### 9.4 `GET /health`

Returns 200 whether or not the database is reachable; `status` is `"ok"` only when
`database === "up"`. A health endpoint that 500s when the database is down tells a load balancer
to remove the one instance that could have reported the problem.

It leaks nothing: no connection string, no secret, no `DATABASE_URL`. There is a test for this.

### 9.6 Server-side re-evaluation

`POST /triage/evaluate` calls the same `evaluateTriage` the phone called. When a report arrives
via sync carrying a client-computed result, the server re-evaluates and stores **both**. A
mismatch means the device is running an old ruleset — a fact worth logging, not an error worth
rejecting a report over.

The response body is checked by `apps/api/test/triage.test.ts` for disease names. It contains a
tier and reasons; it does not contain a diagnosis.

### 9.8 Facilities

`nearby` is ordered by distance. `recommend` runs the full pipeline: evaluate → require → rank,
and returns `reasons` on every recommendation. Freshness is attached to each result as a band, a
confidence and a **label** — and the label must describe the evidence.
`apps/api/test/facilities.test.ts` walks the entire response tree and fails if any key named
`isOpen`, `open`, `available`, `isAvailable`, `status` or `hasBeds` appears anywhere in it.

Signal submission is authenticated: a facility report is only as good as the identity behind it.

---

## 10. Offline sync

The hardest correctness problem in the project, and the one with the clearest success condition:

> **An ASHA's day of offline work survives a dropped connection, a force-quit, a flat battery and
> a duplicate send.**

`apps/api/test/sync.test.ts` is the test that proves it and it is worth reading before writing any
of this.

### 10.1 `packages/core/src/sync/types.ts` — `COMPLETE`

`SyncOperation` carries a `clientOpId`, an `opType` (§3.3), a payload and a client timestamp.
`SyncOpResult` carries the same `clientOpId` back with a status:

| Status | Meaning | Client does |
|---|---|---|
| `APPLIED` | The server wrote it | Delete the outbox row |
| `DUPLICATE` | The server already had this exact op | Delete the outbox row |
| `CONFLICT` | A newer version of the entity exists | Delete the outbox row, set `conflict = 1` on the local entity, show it |
| `REJECTED` | Permanently invalid | Keep the row, mark `REJECTED`, show it |

Anything else — a 5xx, a timeout, no reply at all — leaves the row `PENDING` with `attempts`
incremented. **Never delete on a network error.** A queue that empties itself on a timeout is
indistinguishable, from the worker's side, from a queue that worked.

### 10.2 `packages/core/src/sync/opId.ts` — `STUB`

The op id is a UUID v4 generated **on the device, before the write is attempted**. Not on the
server, not at send time. It is the identity of an *intent*, and the whole idempotency scheme
rests on it existing before anything can go wrong.

The payload fingerprint is a SHA-256 over a canonical serialisation — keys sorted, no incidental
whitespace — so that two structurally identical payloads hash identically regardless of how
JavaScript happened to order the keys. The hash function is injected (`Hasher`) because
`packages/core` has no dependencies.

### 10.3 The ledger — `apps/api/src/modules/sync/repo.ts` + `009_sync.sql`

`sync_operations` stores `client_op_id` (primary key), the payload fingerprint, the resulting
status, and the serialised result. On receiving an op:

1. Look up `client_op_id`.
2. **Not present** → apply it. The ledger row and the actual write happen **in one transaction**,
   **one transaction per operation**. If the write commits and the ledger row does not, a retry
   applies it twice; if the ledger commits and the write does not, the data is lost and the client
   is told it succeeded. Both are unacceptable and a single transaction is what prevents them.
3. **Present, same fingerprint** → return the stored result verbatim, status `DUPLICATE`. Do not
   re-apply, and do not recompute the reply — the client must see the same `serverId` it saw the
   first time.
4. **Present, different fingerprint** → `REJECTED`. The same op id with different content means a
   client bug, and quietly deduplicating it would hide the bug and lose the write.

One bad operation in a batch does not reject the good ones. The HTTP status is still 200; per-op
outcomes live in the body. Every op gets exactly one result, matchable by `clientOpId`.

Household visits arbitrate with `entity_version`, not with a clock. The server keeps the row only
when the incoming version is strictly higher. Two phones editing the same household converge and
the loser gets a `CONFLICT` it can show. Device clocks in the field are wrong often enough that
last-write-wins is not a strategy.

### 10.4 `GET /sync/pull`

Reference data down: facilities, villages, travel times, and the freshness timestamps that go with
them. District-scoped, always — a national table would never fit on the phone (guardrail 6).

Pagination uses a `(updated_at, id)` tuple cursor rather than an offset, because rows change under
a paging client and an offset silently skips them. The cursor the device stores comes from
`serverTime` in the response — **the server's clock, never the device's.** A phone with a wrong
clock would otherwise skip rows permanently and never notice.

**`/sync/pull` never returns patient data.** It is reference data flowing outward. There is a test
asserting the response contains no `triageReports`, `visits`, `householdVisits` or `reports` key.

Push runs before pull. If both cannot complete, the work that only exists on this device is the
work that matters.

---

## 11. Seed data and provenance

`infra/seed/load.ts` loads `facilities.csv` and `villages.csv` into the database, and
`infra/seed/PROVENANCE.md` records where every row came from.

**The loader refuses to seed from empty CSVs, and this is a feature.** If the files contain only
headers it stops and tells the operator to fill them from a real source. Inventing plausible
coordinates for health facilities produces a demo that works and a system that would send someone
to a field. There is no version of this project in which fabricated facility locations are
acceptable, including a hackathon demo.

Populating these two files is a **human task**: district health department facility lists, the
LGD village directory, or an equivalent verifiable source, with the source recorded per row.

---

## 12. `apps/mobile` — the Expo app

### 12.0 Why this is not a workspace

The root `package.json` lists `packages/*` and `apps/api` as workspaces. `apps/mobile` is
deliberately outside that list, installs its own `node_modules`, and reaches the shared packages
over `file:` links.

React Native is unusually sensitive to duplicated copies of `react` and `react-native`, and
workspace hoisting produces exactly that. The symptom is a blank white screen or "Invalid hook
call", neither of which points at the cause. It is also not in the `tsc -b` project graph:

```bash
npm install --prefix apps/mobile
npm --prefix apps/mobile run typecheck
```

### 12.1 `metro.config.js`

`watchFolders` includes the repo root; `nodeModulesPaths` and `disableHierarchicalLookup` pin
resolution; `extraNodeModules` pins single copies of `react`, `react-native` and `zod`.
`unstable_enableSymlinks` lets Metro follow the `file:` links.

Metro reads the raw `.ts` sources of `packages/core` — it resolves an exact path before applying
`sourceExts` substitution — so Babel strips the types on the way through and there is exactly one
copy of the clinical rules in the system.

`schema.sql` must stay in `assetExts` (never move it to `sourceExts`): Metro has no `.sql`
transformer, so a source-ext `.sql` is handed to Babel and the bundle dies on the first SQL
comment. Bundled as an asset instead, `schema.sql` is resolved at startup through `expo-asset`
and read as text — see `src/db/client.ts`.

When an import from `@swasthyasetu/core` fails to resolve, it is almost always a stale cache:
`npm --prefix apps/mobile run start -- -c`.

### 12.2 `app/_layout.tsx` — startup order

Strictly: `initDb()` → `releaseStale()` (reclaim rows left `SENDING` by a crash) → `setLocale()`
→ `restoreSession()`. Each depends on the previous.

**There is no auth gate here.** The citizen flow has no session and must never acquire one.
Requiring a login before triage would put an account between a frightened parent and the answer.

### 12.3 `src/theme/tokens.ts` — `COMPLETE`

The one design rule: **colour means clinical urgency and nothing else.** Cards, headers, lists,
buttons and every ASHA tool are ink on paper. Hue is spent entirely on the four tiers, so a red
block on screen can only ever mean "go now" and can never be mistaken for branding.

The corollary is the one that matters: **freshness has no colour.** A facility confirmed an hour
ago and one confirmed nine days ago differ in ink density, mark and wording — never in
green-versus-grey. Green would be read as "open", which is precisely the claim the backend cannot
make (guardrail 3). Removing the hue removes the temptation.

Designed for a ₹7,000 phone with a dim screen in direct sun, possibly cracked, held one-handed:
body text never below 17pt, contrast at or above 7:1, touch targets 56dp and 64dp on emergency
paths, and never colour alone — roughly one Indian man in twelve has red–green colour vision
deficiency and this app has exactly one red thing that matters.

### 12.4 `src/i18n/strings.ts` — `COMPLETE`

Every user-visible string, Hindi and English, in one file. The copy is part of the safety layer:
most of the ways this project can hurt someone are sentences, not bugs. A correct tier presented
as "You have pneumonia" is a harmful screen produced by working code.

Five wording rules, all of which a new string must satisfy: name no disease; never claim a
facility is open; second person, present tense, one action per sentence; no number a user cannot
act on; and Hindi is the primary text, not a translation of the English.

### 12.5 `src/db/schema.sql` + `client.ts`

Eight tables, created with `IF NOT EXISTS` on every launch, `PRAGMA user_version` gating anything
destructive. WAL journaling, foreign keys on.

The rule the schema exists to enforce: **a write is durable the moment she taps save, and it
leaves this database only when the server has acknowledged it by name.**

Deliberately absent: no patient name, phone or address anywhere — a field phone is lost, shared
and resold, and this database can only ever leak household codes and coded symptoms. No auth
token, which lives in `expo-secure-store` and not in a file any backup tool will copy off the
device. No clinical thresholds, which live in `packages/core`.

### 12.6 `src/db/dao/outbox.ts`

`enqueue` takes an `alsoWrite` callback so that the local row and its queue row are committed in
**one** transaction. If they can separate, a crash between them either loses the write or queues
something that does not exist.

`claimBatch` marks rows `SENDING`; `releaseStale` reclaims them on startup after a crash;
`applyResults` acts on the four statuses in §10.1. Backoff is exponential with jitter — a village
where thirty phones regain signal at once must not become a thundering herd.

Oldest first, always. A queue that reorders itself is impossible to explain to a worker asking why
yesterday's visit has not gone.

### 12.7 `src/db/dao/facilities.ts`

**This file fetches rows. It does not rank them.** Ranking is `rankFacilities` in
`packages/core`, on the same data, by the same code the server runs. A comparator written in a DAO
or a component is how the phone and the server start disagreeing about where to send a patient.

Column names and units match `FacilityCandidate` exactly (§5, §12.5) so the DAO hands rows
straight to the ranker.

### 12.8 `src/sync/runner.ts`

**The sync runner is allowed to fail. It is not allowed to lose anything.** Push before pull.
Triggered on connectivity regain, on app foreground, and manually from the queue screen.

The acceptance test is manual and it is the real one: record several visits in airplane mode,
force-quit the app, restore connectivity, confirm every record arrives exactly once, then send the
same batch again and confirm nothing duplicates.

### 12.9 `src/api/client.ts`

The only file in the app that calls `fetch`. 20-second timeout, envelope parsing, token attachment.
No retry logic here — retry policy belongs to the outbox, which is the thing that knows what is
safe to retry.

### 12.10 Result screen and `TierBanner`

`TierBanner` is the single most important component in the application: everything upstream exists
so that it shows the right one of four words. The tier is carried four ways at once — the word,
the mark's shape, the fill, and the banner's position at the top of the screen. Remove any one and
the other three still work.

Never in this component: a disease name, a score or percentage, a ruleset version, an animation,
an emoji or a siren icon. The word and the colour are doing the work; decoration on top reads as
alarm and makes people stop reading.

Every result screen carries `triage.disclaimer` without exception: *"This is not a diagnosis. It
only tells you how soon to get help."* Short on purpose — a paragraph of legal text gets scrolled
past.

### 12.11 Facilities screen and `FreshnessChip`

`FreshnessChip` is the entire user-facing surface of guardrail 3. Banned strings, in both
languages: "Open", "Open now", "Closed", "Available", "Unavailable", "Live", "Verified", a green
tick, a red cross, a traffic light of any kind. Every one asserts a present-tense fact about the
world; what the system has is a past-tense fact about a report.

Age is recomputed against the current clock on every render. A formatted string cached two days
ago will still claim two days a fortnight later. Round down, but never down across a band
boundary — 13.9 days shows "13 days", not "2 weeks".

Any list showing these chips also shows `freshness.callFirst` once at the top. The honest
instruction after "we last heard on Tuesday" is "ring them before you set out", and it costs one
line.

### 12.12 In-app IVR voice guide

The citizen and ASHA entry screens offer a voice-guided triage mode. It reads the bilingual,
on-screen questions through the device text-to-speech service and accepts large numbered keypad
answers. Every prompt remains visible if a device voice is missing or muted.

The voice layer is presentation only. It does not use a microphone, transcribe speech, diagnose,
or determine urgency. It builds the same `Encounter` as the tap flow, calls the same on-device
`evaluateTriage`, saves through the same SQLite outbox, and reads the standard result copy aloud.
Phone-line IVR still requires a telecom provider and remains deferred.

---

## 13. The RAG seam — planned, not built

`POST /rag/ask` exists and returns **501 with `error.code === "NOT_IMPLEMENTED"`**. There is a
test asserting that. `010_rag_placeholder.sql` creates empty `documents` and `chunks` tables with
a vector column so the schema does not have to change later, and `RAG_ENABLED` defaults to false.

That is the whole of v1. The endpoint is a seam, not a feature, and `README.md` lists it under
planned.

When it is built, three constraints already hold and do not move: retrieval answers "what does
approved guidance say" and never "is this facility open" (guardrail 2); it is never on the
critical path, so a failure still leaves the user a tier and a destination; and every model call
happens on the backend, because no credential reaches the mobile bundle (guardrail 7).

---

## 14. Build order, verification and honesty

### 14.1 Phases

Each phase ends green before the next begins.

| Phase | What | Verify with |
|---|---|---|
| 0 | Infra up, migrations applied | `npm run db:up && npm run db:migrate` |
| 1 | `packages/core` triage engine | `npm run test:core` |
| 2 | Contracts + API skeleton | `npm run dev:api`, `GET /health` |
| 3 | Auth + `/triage/evaluate` | `npm run test:api` |
| 4 | Geography, facilities, seed | `npm run db:seed` |
| 5 | Routing tables | `npm run routing:precompute` |
| 6 | Ranking + recommendations | `npm run test:core && npm run test:api` |
| 7 | Mobile shell + citizen flow | manual, airplane mode |
| 8 | ASHA offline workflow | manual, force-quit test |
| 9 | Sync | `npm run test:api` |
| 10 | RAG seam + honesty pass | `npm run verify` |

**Start at phase 1.** It needs no database, no network and no installed packages — just
`node --test`. Get the safety layer green before anything else exists to distract from it.

### 14.2 How to implement a stub

Read the header (it lists `MAY IMPORT`, `MUST NOT IMPORT`, exports and numbered steps). Read the
test file next to it — **the tests are the real spec.** Write the body. Run the test. Do not move
on until it is green.

### 14.3 `npm run verify`

`typecheck` → `test:core` → `test:scenarios` → `test:api` → `check-no-secrets`.

`test:scenarios` runs the ten clinical fixtures in `tests/scenarios/` against `evaluateTriage`. It
sits between the unit tests and the API tests on purpose: the unit tests check that each function
behaves, and these check that the system as a whole still gives the same clinical answers it gave
yesterday. A fixture edited to make it pass has been deleted, whatever the diff says.

`scripts/check-no-secrets.mjs` scans `apps/mobile` for six credential patterns and fails the
build on a match. Anything prefixed `EXPO_PUBLIC_` is inlined into the bundle in plain text, so
"it is only in an env var" is not a defence. Every model call and every database query happens on
the backend.

### 14.4 The honesty pass

Three things must be true at the end, in code and in the demo:

1. The rules are **not clinically validated**. `docs/SAFETY.md` records each rule's source and
   states plainly that no clinician has reviewed them. `app/about.tsx` shows that statement at
   full size, not in a footnote. It is not to be softened for a presentation.
2. Facility freshness is **evidence age**, not live availability.
3. `README.md` keeps an accurate implemented-vs-planned table. RAG is planned, not built.

A judge asking "how do you know this is safe?" should get the honest answer — that the rules are
transparent, deterministic, auditable and unvalidated — rather than a confident one. The
architecture is the argument; overclaiming on top of it only weakens it.

### 14.5 Open questions

Search for `DECIDE:` in file headers. Do not guess and move on silently — leave the marker and say
so.

- **Resolved:** no official image ships both PostGIS and pgvector, so `infra/Dockerfile.db` builds
  from the PostGIS base and adds pgvector. Confirm both `CREATE EXTENSION` calls succeed in phase 0.
- **Open, human task:** `infra/seed/*.csv` are empty by design and need real facility and village
  data with recorded provenance before phase 4 can pass (§11).
- **Open:** the red-flag rules need review by a clinician before this is shown to anyone as
  anything other than a prototype.
