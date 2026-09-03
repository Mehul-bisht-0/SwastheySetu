# SwasthyaSetu

Offline-first rural healthcare decision support. Two users: a rural citizen who needs to know how
urgent a symptom is and where to go, and an ASHA health worker who records household visits and
keeps facility data honest — both working with no reliable connectivity.

> **Prototype. Not clinically validated. Not a diagnostic tool.**
> Triage rules are derived from published danger-sign lists and have not been reviewed by a
> clinician. See `docs/SAFETY.md`.

---

## Status: what is built and what is not

| Capability | Status |
|---|---|
| Citizen symptom flow, offline | Planned — phase 7 |
| Deterministic red-flag rules | Planned — phase 1 |
| Urgency classifier (transparent scorecard) | Planned — phase 1 |
| Facility ranking: capability + travel time + freshness | Planned — phase 6 |
| Precomputed OSRM travel times | Planned — phase 5 |
| ASHA household visits, offline | Planned — phase 8 |
| Idempotent sync | Planned — phase 9 |
| **ASHA Knowledge Assistant (RAG)** | **Not implemented.** Interface and tables only |
| Live facility availability | **Not implemented and not planned.** The app reports evidence age, never "open" |
| Clinical validation | **Not done** |
| SMS / IVR access | Future |

Update this table as phases land. It is what the demo audience is shown; keeping it accurate is a
project requirement, not a nicety.

---

## Setup (about 10 minutes)

Requires Node 22+ and Docker.

```bash
git clone <repo> && cd swasthyasetu
cp .env.example .env          # then edit JWT_SECRET to 32+ random chars
npm install

npm run db:up                 # Postgres with PostGIS + pgvector
npm run db:migrate            # applies infra/migrations/*.sql in order
npm run db:seed               # one demo district

npm run dev:api               # http://localhost:4000/health
npm run dev:mobile            # Expo; open on a device on the same network
```

The safety layer needs none of the above — it is dependency-free and runs immediately:

```bash
npm run test:core
```

### Regenerating travel times (only when facility or village data changes)

```bash
# place a district .osm.pbf in infra/routing/data/ first
npm run routing:up
npm run routing:precompute
```

OSRM is a **build-time** dependency. Nothing in a mobile request path calls it.

---

## Layout

```
packages/core        pure, zero-dependency domain logic (triage + ranking).
                     Runs identically on device and on server — this is what
                     makes offline triage possible.
packages/contracts   zod schemas shared by API and mobile client
apps/api             Fastify service. All model/third-party calls happen here
apps/mobile          Expo app, offline-first, SQLite + sync queue
infra                docker compose, SQL migrations, seed data, routing scripts
docs                 architecture, safety notes, demo script
```

`AGENTS.md` explains the file-status markers and how to work through the skeleton.
`IMPLEMENTATION_PLAN.md` is the full specification.

---

## Not implemented in v1 (deliberately)

No refresh-token rotation or revocation, no audit log, no HTTPS termination (dev over LAN only),
no multi-district authorisation, no background job runner, no concurrent-edit resolution for visits
(last-write-wins only), and no data retention or consent policy. Household visit records and triage
reports are health data — treat this prototype accordingly and do not point it at real households
without addressing that.

---

## Development commands

| Command | Does |
|---|---|
| `npm run test:core` | safety layer tests, no install or DB needed |
| `npm run test:api` | API integration tests against the Docker Postgres |
| `npm run typecheck` | project-wide `tsc -b` |
| `npm run verify` | typecheck + all tests + secret scan |
