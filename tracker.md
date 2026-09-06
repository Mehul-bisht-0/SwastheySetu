# SwasthyaSetu implementation tracker

Updated: 2026-09-03

This file records phase-gate verification. A phase is marked complete only when its verification command is green. Verification proceeds in the order defined by `IMPLEMENTATION_PLAN.md` §14.1; the next unfinished phase is not started without user input.

| Phase | Scope | Status | Verification evidence |
|---|---|---|---|
| 0 | Infra up, migrations applied | Complete | Database container healthy; all 10 migrations applied; `postgis` and `vector` extensions confirmed on 2026-09-03 |
| 1 | `packages/core` triage engine | Complete | `npm run test:core` passed: 126/126 tests on 2026-09-03 |
| 2 | Contracts + API skeleton | Complete | Dev server started and `GET /health` returned HTTP 200; health tests 7/7; contracts and API typechecks passed on 2026-09-03 |
| 3 | Auth + `/triage/evaluate` | Complete | `npm run test:api` passed with 17 passed, 0 failed, 18 database-dependent skips; auth smoke checks returned expected 401/400 on 2026-09-03 |
| 4 | Geography, facilities, seed | Complete | `npm run db:seed` passed twice; 1 district, 25 villages, 12 facilities, 2 users, and 4 activity rows; no duplicates and all geometry checks passed on 2026-09-03 |
| 5 | Routing tables | Complete | `npm run routing:precompute` passed; all 300 village–facility pairs populated and second run wrote 0 rows on 2026-09-03 |
| 6 | Ranking + recommendations | Complete | `npm run test:core` passed 126/126; `npm run test:api` passed with 21 passed, 0 failed, and 18 legacy COMPLETE-test skips; API typecheck and routing-index check passed on 2026-09-03 |
| 7 | Mobile shell + citizen flow | Complete | Mobile typecheck, secret scan, and Android bundle passed. The public nearby endpoint primes the offline facility cache; the user confirmed facilities remain available in the manual airplane-mode flow on 2026-09-03. |
| 8 | ASHA offline workflow | In progress | Authenticated ASHA API tests, API/mobile typechecks, secret scan, and Android bundle are green. Manual offline force-quit persistence test remains. |
| 9 | Sync | Not implemented | Explicit `NOT_IMPLEMENTED` bodies remain in sync service and repository |
| 10 | RAG seam + honesty pass | Not yet verified | Gate: `npm run verify`; RAG remains intentionally unimplemented beyond the 501 seam |

## Open decisions and human inputs

- Phase 4 seed inputs are populated and `infra/seed/PROVENANCE.md` records their stated sources. Any future replacement data must remain real and citable; do not fabricate it.
- `infra/migrations/010_rag_placeholder.sql` retains a `DECIDE:` marker for embedding dimensions; RAG is not built in v1.
- Red-flag rules require clinician review before use beyond a prototype.

## Verification log

- 2026-09-03: Loaded `AGENTS.md` and the phase gates in `IMPLEMENTATION_PLAN.md` §14. No implementation changes made before verification.
- 2026-09-03: Phase 1 gate passed with `npm run test:core` (126 tests passed, 0 failed). The command also includes later-phase core unit tests; those phases remain unverified until their complete gates pass.
- 2026-09-03: Phase 2 gate passed. `npm run dev:api` listened on port 4312 and a real HTTP request to `/health` returned 200 with `status: "degraded"`, `database: "down"`, and `ragEnabled: false`, as required when PostgreSQL is unavailable.
- 2026-09-03: Phase 2 health suite passed (7 tests, 0 failed). `@swasthyasetu/contracts` and `@swasthyasetu/api` typechecks also passed.
- 2026-09-03: Corrected root workspace configuration to exclude `apps/mobile`, matching `AGENTS.md` and the lockfile, and restored the lockfile's TypeScript/Node type dev dependencies so clean installs can typecheck.
- 2026-09-03: Phase 3 gate passed with `npm run test:api` (17 passed, 0 failed, 18 skipped because PostgreSQL was unavailable). All 10 `/triage/evaluate` tests passed, including public access, validation, red-flag precedence, pregnancy safety widening, disclaimer, and deterministic output.
- 2026-09-03: Additional no-database auth smoke checks passed: unauthenticated `GET /auth/me` returned the standard 401 `UNAUTHORIZED` envelope, and malformed `POST /auth/login` returned the standard 400 `VALIDATION_FAILED` envelope with field details.
- 2026-09-03: Phase 4 input check found 12 facility rows and 25 village rows, with the provenance fields populated; the empty-CSV stop condition did not apply.
- 2026-09-03: Phase 0 infrastructure was brought up as a Phase 4 prerequisite. The database container became healthy, all 10 migrations applied, and both required extensions (`postgis`, `vector`) were confirmed.
- 2026-09-03: Phase 4 gate passed twice with `npm run db:seed`. Post-seed checks confirmed 1 district, 25 villages, 12 facilities, 2 users, 4 activity rows, zero duplicate village/facility names, and correct longitude/latitude geometry for every facility.
- 2026-09-03: Phase 5 initially failed because the root command delegated to a missing API workspace script. Added the missing `routing:precompute` script to `apps/api/package.json`.
- 2026-09-03: Phase 5 gate passed. The first run populated all 300 village–facility pairs and the second run wrote 0 rows while retaining full coverage, confirming idempotency.
- 2026-09-03: Phase 5 database checks confirmed 300/300 pairs, zero missing or invalid rows, and the `travel_times_lookup` index. All rows are honestly labeled `ESTIMATED`; no district OSRM dataset is currently present. API typecheck passed.
- 2026-09-03: Phase 6 inspection found the core ranker, routing repository, facilities endpoints, and response mapping substantially implemented. Work stopped at the unresolved `DECIDE:` marker in `apps/api/src/modules/routing/service.ts`: a result-only request lacks the patient context required for safe paediatric/obstetric capability filtering, while the current code fabricates a 30-year-old male encounter.
- 2026-09-03: Resolved the Phase 6 `DECIDE:` with the encounter-required policy. Result-only recommendation requests now return a standard 400 validation error before database access; fabricated patient context was removed.
- 2026-09-03: Policy verification passed: focused HTTP regression test 1/1, API typecheck, and seeded-database smoke checks for child `PAEDIATRIC` and reproductive-age unknown-pregnancy `DELIVERY` requirements. Existing encounter-based requests still return HTTP 200.
- 2026-09-03: Phase 6 inspection also found that the recommendation service ignored `maxResults` and returned fabricated district/demo metadata. It now applies the request limit and maps both fields from the facility row.
- 2026-09-03: Phase 6 gate passed: `npm run test:core` completed with 126 passed and 0 failed; `npm run test:api` completed with 21 passed, 0 failed, and 18 skipped. The new database-backed Phase 6 coverage validates the shared response contract, request result limit, real facility metadata, paediatric and obstetric requirements, emergency ranking, evidence-honesty fields, and estimated-route disclosure. API typecheck also passed.
- 2026-09-03: A forced-index query plan used `travel_times_lookup` (`Bitmap Index Scan`) for the village routing lookup.
- 2026-09-03: Phase 7 baseline required the separate mobile dependency install prescribed by `AGENTS.md`. After installation, the mobile typecheck exposed two implementation defects: the SQLite transaction wrapper attempted to return Expo's `void` transaction result, and the facilities screen called `requiredCapability` with an obsolete signature.
- 2026-09-03: Phase 7 partial implementation fixed the transaction wrapper and capability call, preserved the full offline ranking outcome, surfaced ranking reasons and fallback disclosure, added the required “Call before you set out” warning, showed the offline-computation notice, and corrected the root mobile launch command. `expo-asset` was added directly because the COMPLETE resolver disables hierarchical lookup and Expo Metro requires it at the mobile package root.
- 2026-09-03: Phase 7 static verification passed: `npm --prefix apps/mobile run typecheck`, `node scripts/check-no-secrets.mjs`, and `git diff --check` are green. The documented 14-month-old fever plus fast-breathing encounter evaluates locally to `EMERGENCY` with rule `RF_CHILD_FAST_BREATHING`.
- 2026-09-03: Phase 7 runtime verification is blocked before the manual airplane-mode walkthrough. Offline Metro startup succeeds and begins Android bundling, but bundling fails after traversing 1,099 modules because `apps/mobile/metro.config.js` classifies `.sql` as source while providing no transformer; Babel then parses the COMPLETE `src/db/schema.sql` as JavaScript. Both files are marked COMPLETE, so neither was modified without a human decision.
- 2026-09-03: After the mobile package was externally upgraded from Expo SDK 52 to SDK 57, Android bundling exposed SDK dependencies nested beyond the COMPLETE resolver boundary. Promoted the matching `expo-modules-core` and `promise` runtime versions to direct mobile dependencies. The reported `expo-modules-core` failure is resolved; bundling now traverses 1,481 modules and stops only at the previously recorded raw-SQL transformer blocker.
- 2026-09-03: Phase 7 bundling blocker resolved (human decision given). `apps/mobile/metro.config.js` keeps `sql` in `assetExts` instead of moving it to `sourceExts`, and `src/db/client.ts` reads the bundled `schema.sql` via `expo-asset` (`downloadAsync`) + `expo-file-system` (`new File(localUri).text()`), so Metro never hands SQL to Babel. `expo-file-system@~57.0.6` was promoted to a direct mobile dependency (already present transitively). `expo export --platform android` now completes with `src/db/schema.sql` listed among the bundled assets. The UTF-8 BOM on the root `package.json` was also stripped: Metro's PackageCache strict-parses that file during asset resolution, and the BOM crashed every asset import.
- 2026-09-03: Device testing exposed an empty Phase 7 facility cache. The seed and public API were healthy (the demo-area nearby request returned HTTP 200 with 9 evidence-backed facilities), but the only prior cache-fill path depended on the deliberately unfinished Phase 9 authenticated sync endpoint.
- 2026-09-03: Added a Phase 7 bootstrap from the existing public `/facilities/nearby` endpoint. An online app launch now refreshes only `facilities_cache`, preserving later-phase village and travel-time data; offline ranking never invents coordinates, capability, or freshness evidence. A cold Android Metro bundle including this path returned HTTP 200 (6,570,235 bytes; 1,476 modules).
- 2026-09-03: Phase 7 gate passed. The user completed the device walkthrough and confirmed that facility recommendations are available after the airplane-mode transition. Phase 8 was not started.
- 2026-09-03: Phase 8 inspection found the durable SQLite visit/outbox schema, atomic local write, cached-session shell, and basic visit screen already present. The ASHA API route/service/repository files were still explicit stubs, and the mobile form wrote an invalid `village-mock` identifier with an incomplete payload.
- 2026-09-03: Implemented authenticated `/asha/villages` and `/asha/visits` routes with district-scoped village reads, ASHA-scoped visit reads, version-guarded upserts, and shared-contract response mapping. Focused database coverage passed 4/4 for auth, villages, create/update/conflict, and per-ASHA isolation.
- 2026-09-03: Completed the Phase 8 mobile path: online sign-in caches real district villages; the offline form selects a cached village and records household code, members seen, referral, and notes; the complete shared visit payload and outbox operation are written atomically; recent visits and their pending state are visible after navigation or restart.
- 2026-09-03: Phase 8 automated checks passed: full API suite 25 passed, 0 failed, 18 known legacy skips; API and mobile typechecks; mobile secret scan; `git diff --check`; and a cold Android bundle (HTTP 200, 6,584,606 bytes, 1,478 modules). The manual airplane-mode force-quit gate remains before Phase 8 can be marked complete.

## Non-blocking observations

- Fastify reports that its top-level `disableRequestLogging` option is deprecated and will be removed in Fastify 6. It does not fail Phase 2 on the currently locked Fastify 5 release.
- `npm ci` reports two critical dependency audit findings. No automatic audit fix was applied because that could introduce unrelated breaking upgrades.
- Phase 3's earlier API run skipped its database-backed successful-login path. Infrastructure and seeded users are now present, so that integration can be exercised separately if Phase 3 is re-verified.
- The seed command emits Node's `MODULE_TYPELESS_PACKAGE_JSON` warning because the root package does not declare a module type. It does not fail the Phase 4 gate.
- Eighteen legacy tests in COMPLETE files self-skip even with PostgreSQL running because their skip flag is fixed before the suite's database hook, and their login fixture/API shapes predate the completed seed and contracts. The Phase 6 gate is green, but these skips are recorded rather than treated as exercised coverage; the COMPLETE files were not modified.
