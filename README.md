# SwasthyaSetu

SwasthyaSetu is an offline-first rural healthcare decision-support prototype for community members and ASHA workers. It also contains a provider-neutral keypad telephone IVR prototype for callers who have a basic phone or no internet connection.

> **Prototype only. Not clinically validated. Not a diagnostic tool.**
>
> No clinician has reviewed or approved the current questions, red-flag rules, scorecard, advice or escalation workflow. Do not use this system as the sole basis for a decision about a sick person or deploy it with real patient data. See [docs/SAFETY.md](docs/SAFETY.md).

## Current status

| Capability | Status |
|---|---|
| Public landing page | Implemented — ASHA sign-in plus patient symptom checker and voice guide |
| Visual symptom checker | Implemented — details, symptoms, follow-up questions and offline result |
| In-app voice guide | Implemented — Hindi/English spoken prompts and numbered screen choices |
| Deterministic red flags and urgency scorecard | Implemented — shared by phone and API |
| Clinical validation | **Not completed** |
| Offline facility ranking | Implemented — capability, travel estimate and evidence freshness |
| Live facility availability | **Not implemented and not claimed** |
| ASHA authentication and worker-only home | Implemented |
| ASHA offline household visits and sync | Implemented |
| Worker assignment and human handoff | Stage 2 Phase 1 implemented |
| Keypad telephone IVR backend | Stage 2 Phase 2 provider-neutral prototype implemented |
| Live telephone number/provider integration | **Not implemented** |
| Phase 3 voice agent, transcription and summaries | **Not implemented or approved yet** |
| Phase 4 worker knowledge assistant/RAG | **Not implemented** — database seam only |
| Production privacy, identity and retention policy | **Not completed** |
| Production deployment/security approval | **Not completed** |

The facility cache and seed are a Nalanda demonstration with simulated facility reports. Travel precomputation currently contains 300 straight-line `ESTIMATED` pairs; OSRM road routes remain planned.

## Application flow

### Startup and role separation

The mobile app initializes SQLite, recovers interrupted outbox operations, restores a cached ASHA session and starts the sync coordinator.

- Signed out: `/` shows ASHA sign-in, **Check symptoms** and **Use the voice guide**.
- Signed in: `/` redirects to the ASHA home screen.
- ASHA home contains only Case inbox, Record a visit, Waiting to send, Recent visits and Sign out.
- Signing out returns to the public landing page.

### Visual patient flow

```text
Public home
  -> Patient details
  -> Select symptoms
  -> Follow-up questions
  -> Deterministic on-device urgency evaluation
  -> Result, explanation and safety notice
  -> Facility ranking when in-person care is recommended
```

The follow-up sequence remains part of the application and covers:

- ability to drink;
- severe headache when pregnancy may be relevant;
- blood in stool when diarrhoea was selected;
- persistent vomiting when vomiting was selected;
- symptom and fever duration;
- reduced activity;
- long-term health conditions;
- whether the concern is getting worse; and
- pain score.

If a symptom or follow-up answer activates an emergency red flag, the remaining questionnaire ends and the emergency result appears immediately. The scorecard never runs after a red flag fires.

Evaluation and local saving require no API. The report and immutable outbox operation are written atomically. Recent work fixed the anonymous offline save without removing any follow-up questions.

### In-app voice guide

```text
Public home
  -> Hindi or English
  -> Spoken prototype and safety introduction
  -> Age, sex and pregnancy
  -> Spoken numbered symptom choices
  -> The same follow-up questions in voice mode
  -> The same deterministic result, read aloud
```

The guide uses on-device text-to-speech. It is a screen-based accessibility flow, not speech recognition or a telephone call. Visible controls remain usable if speech playback fails.

### Results and facilities

The decision engine returns `EMERGENCY`, `GO_NOW`, `PHC_SOON` or `SELF_CARE`. The result shows the action, reasons, non-diagnostic notice and additional danger signs for `SELF_CARE`. All clinical wording and thresholds still require review.

For in-person care, the user may grant foreground location permission or choose a cached village. Ranking runs on the phone and considers required capability, distance/travel estimates and evidence age. The app never says a facility is currently “open” or “available”; it shows evidence freshness and asks the user to confirm by phone.

### ASHA worker flow

```text
Public home
  -> ASHA sign-in
  -> ASHA home
     -> Case inbox
     -> Record a visit
     -> Waiting to send
     -> Recent visits
     -> Sign out
```

First sign-in requires the API. The token is stored in the platform secure store rather than SQLite. An installation stays bound to the first worker who owns its local records, preventing records from different workers being silently mixed.

Saving a visit writes the local record and its outbox operation in one transaction. The home screen shows whether it is waiting, sent or needs review after a conflict.

### Case assignment and human handoff

Stage 2 Phase 1 provides:

- one designated primary ASHA per village;
- automatic assignment to the active primary worker;
- an unassigned queue when no worker is configured;
- supervisor assignment and reassignment;
- assignment metadata only for supervisors;
- full intake and transcript only for the assigned ASHA;
- acknowledgement, handoff request and completed follow-up actions; and
- audited reads and important assignment changes.

```text
UNASSIGNED -> ASSIGNED -> ACKNOWLEDGED -> CLOSED
                  |             |
                  +-> HANDOFF_REQUESTED
```

Reassignment resets acknowledgement. The existing worker remains responsible after requesting handoff until reassignment occurs. Closed cases are not reopened in this prototype. Versions and row locks protect concurrent updates.

The inbox is online-only and uses `Cache-Control: no-store`. Sensitive content is cleared when the screen loses focus or the app enters the background. This reduces exposure on a lost/shared phone, but an ASHA cannot read a new case offline. The pilot must accept that tradeoff or approve an encrypted, limited offline cache.

The inbox’s case-creation control submits fixed synthetic data for testing. It is not a real patient intake form.

### Waiting-to-send queue

The outbox retains a write until the server acknowledges its operation ID:

- `APPLIED` and `DUPLICATE` remove the operation;
- `CONFLICT` retains and marks the local visit for review;
- `REJECTED` remains visible;
- network failure returns it to `PENDING` with exponential backoff; and
- **Send now** bypasses backoff for an explicit retry.

Automatic sync runs on foreground entry, connectivity changes and a five-minute timer. The queue count interpolation and manual-retry behavior were repaired during stabilization.

A Wi-Fi icon does not prove the API is reachable. `EXPO_PUBLIC_API_URL`, the computer’s current LAN address, the API process, firewall and CORS must all be correct.

### Keypad telephone IVR

Stage 2 Phase 2 implements:

```text
Incoming call
  -> Hindi or English
  -> Automated-system, storage and no-recording notice
  -> Consent
  -> Calling for self or another person
  -> Village dial code
  -> Non-diagnostic reason category
  -> Duration band
  -> Callback preference
  -> Review and confirmation
  -> Case creation
  -> Primary-worker assignment or unassigned queue
  -> Human follow-up
```

The state machine handles DTMF, invalid digits, timeouts, bounded retries, hang-up and provider replay. With sufficient consent and routing information, uncertainty or an incomplete call creates a human-review case. It does not diagnose, run clinical triage, promise emergency response, store audio or use AI.

`POST /ivr/webhooks/prototype` accepts normalized `START`, `DTMF`, `TIMEOUT` and `HANGUP` events and returns `PLAY`, `GATHER` and `HANGUP` commands. A live service still requires a dedicated number, provider selection, signed adapter and reviewed recordings.

## Architecture and safety boundaries

| Engine | Location | Responsibility |
|---|---|---|
| Decision | `packages/core/src/triage` | How urgent is the reported concern? |
| Routing | `packages/core/src/facilities`, API routing module | Where may the required capability exist? |
| Knowledge | `apps/api/src/modules/rag` | What does approved guidance say? |

Decision runs before routing. The future knowledge engine stays downstream and must never change urgency, diagnose, select treatment or claim facility availability. No AI client is allowed inside decision or routing.

`packages/core` has no runtime dependencies, network calls, environment access or model SDK. The same source runs on Android and the server. Results record the ruleset, time, source and reasons for auditability.

## Storage, privacy and identity

Mobile SQLite avoids patient names, phone numbers and street addresses. It stores coded encounters, structured results, household codes, caches and pending operations. Tokens live in `expo-secure-store`.

Stage 2 server cases may contain identity and callback data. `CASE_RETENTION_DAYS` configures expiry, and `scripts/purge-expired-cases.ts` purges expired case and IVR rows. This does not establish an approved policy. Retention, backup deletion, recording, consent, identity, access review and incident response require formal review.

Phone ownership alone is not proof of identity. Patient/case data remains in authenticated application tables and is kept separate from the future RAG knowledge base.

### Known patient-report ownership gap

The visual checker places reports in the local outbox. Signed-out sync refreshes public facility data but pushes queued writes only after ASHA authentication. Anonymous reports therefore remain local until a worker signs in, creating ambiguous attribution and consent.

Before a real pilot, implement one explicit behavior:

1. keep anonymous checks only on the phone and expire them locally; or
2. obtain submission consent and use a dedicated public case/report workflow with abuse protection and assignment.

The current behavior must not be presented as completed patient-to-ASHA submission.

## API surface

| Area | Main routes | Access |
|---|---|---|
| Health | `GET /health` | Public |
| Authentication | `POST /auth/login`, `GET /auth/me` | Login public; profile authenticated |
| Triage | `POST /triage/evaluate`, `POST /triage/reports` | Public prototype |
| Facilities | Nearby and recommendation routes | Public reads; authenticated signals |
| ASHA visits | `/asha/*` | Authenticated |
| Sync | `POST /sync/push`, `GET /sync/pull` | Authenticated |
| Assignment | `/assignments/*` | Authenticated and role-scoped |
| IVR | `POST /ivr/webhooks/prototype` | Server-secret-authenticated |
| RAG | `POST /rag/ask` | Returns `501`; unimplemented |

Routes validate HTTP input and delegate work. Business logic belongs in `service.ts`; parameterized SQL belongs in `repo.ts`.

## Database migrations

| Migration | Purpose |
|---|---|
| `001`–`010` | Identity, geography, facilities, evidence, routing, triage, ASHA, sync and unused RAG seam |
| `011_triage_result_snapshots.sql` | Client/server result snapshots for mismatch auditing |
| `012_worker_assignment.sql` | Village roster, intake cases and assignment/handoff audit |
| `013_keypad_ivr.sql` | IVR sessions, event replay, dial-code routing and IVR case metadata |

**Migration checkpoint:** 011–013 have been applied only to the isolated `swasthyasetu_test` database used during this work. Do not run the chain against another database until Migration 011’s compatibility, data impact and necessity are reviewed for that target. See [docs/MIGRATION_011_REVIEW.md](docs/MIGRATION_011_REVIEW.md).

## Repository layout

```text
packages/core        Shared dependency-free decision and routing logic
packages/contracts   Shared Zod request/response contracts
apps/api             Fastify API and PostgreSQL repositories
apps/mobile          Expo app, SQLite and synchronization
infra/migrations     Append-only PostgreSQL migrations
infra/seed           Synthetic demo data
infra/routing        Build-time travel precomputation
scripts              Verification, test preparation and retention purge
tests                Scenario and mobile SQLite regressions
docs                 Architecture, safety, demo and Stage 2 notes
```

Read [AGENTS.md](AGENTS.md) before changing code. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the original specification. Phase details are in [docs/STAGE2_PHASE1.md](docs/STAGE2_PHASE1.md) and [docs/STAGE2_PHASE2.md](docs/STAGE2_PHASE2.md).

## Local setup

Requirements: Node 22+, npm 10.9+, Docker Desktop and Expo Go or an Android emulator.

Install root/API and mobile dependencies separately:

```powershell
npm install
npm install --prefix apps/mobile
```

Copy `.env.example` to `.env` and configure server-only values such as `JWT_SECRET`, `DATABASE_URL`, `CASE_RETENTION_DAYS` and `IVR_WEBHOOK_SECRET`. Never copy them into mobile.

Create `apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4000
EXPO_PUBLIC_BUILD_LABEL=dev
```

On a phone, `localhost` means the phone. Recheck the computer’s Wi-Fi IPv4 address whenever the network changes.

### Database safety gate

Do not run `npm run db:migrate` against a new or existing database until Migration 011 has been reviewed for that exact target. The runner applies every migration in order, including 011–013. Test preparation requires `NODE_ENV=test` and a database name ending in `_test`; never point it at a working dataset.

### Start the API

After selecting an approved database:

```powershell
npm run dev:api
```

The default port is 4000. Check `http://localhost:4000/health` on the computer and `http://YOUR_COMPUTER_LAN_IP:4000/health` from the phone browser.

### Start Expo

From the repository root:

```powershell
npm run dev:mobile -- --clear
```

Or from the mobile directory:

```powershell
cd apps/mobile
npm run start -- --clear
```

Do not run `npx expo start` from the repository root. That makes legacy `expo/AppEntry.js` search for a nonexistent root `App` file. Press `r` to reload and `Ctrl+C` to stop.

## Verification

| Command | Purpose |
|---|---|
| `npm run typecheck` | Root packages and API |
| `npm run typecheck:mobile` | Expo application |
| `npm run test:core` | Decision/routing unit tests |
| `npm run test:scenarios` | Fixed clinical scenarios |
| `npm run test:mobile-storage` | Registered outbox regressions |
| `node --test tests/mobile-reports.test.mjs` | Patient report-save regressions |
| `npm run test:api` | Serial API integration tests |
| `npm run test:db:prepare` | Reset/seed an explicit `*_test` DB only |
| `npm run verify` | Typechecks, tests and mobile secret scan |

Phase 2 full verification passed against the isolated test database: both typechecks, 126 core tests, 13 scenarios, five registered mobile-storage tests, 58 API tests (40 passing and 18 documented protected legacy skips) and the secret scan. All new Phase 1/2 tests ran and passed.

After the recent landing, queue and patient-save changes, mobile typecheck passed, five outbox plus two report-save tests passed, and Android export passed with 1,374 modules. Physical-device airplane-mode, process-kill, background privacy, accessibility and low-cost-device acceptance remain outstanding.

## What must be done next

### Before Phase 3

1. **Resolve anonymous report ownership and consent.** Keep patient checks local or add an explicitly consented submission workflow.
2. **Add review and confirmation.** Confirm demographics, symptoms and important answers before non-emergency submission.
3. **Add the patient privacy notice.** Explain local storage, optional sharing, retention and follow-up.
4. **Complete Hindi coverage.** Some visual labels and operational messages remain English-only.
5. **Validate emergency and handoff actions.** Clinical/program owners must approve wording, contact behavior and response expectations.
6. **Separate supervisor operations.** Keep roster/reassignment management out of normal worker tasks.
7. **Complete device testing.** Cheap Android phones, large fonts, screen readers, Hindi speech, airplane mode, transitions, force quit and recovery.
8. **Improve support diagnostics.** Show privacy-safe support codes or actionable causes for save, login and connectivity failures.

### Real-patient pilot gates

Before a pilot:

- clinically review and version-approve every question, rule, threshold, result message and capability requirement;
- define the responsible medical/program authority and escalation procedure;
- approve consent, identity, recording, retention, deletion, grievance and breach policies;
- complete threat modelling, access review, HTTPS deployment, backup/restore and penetration testing;
- validate facility sources and evidence-expiry policy;
- define staffing, acknowledgement and callback service levels;
- conduct supervised ASHA/community usability testing; and
- document monitoring, adverse-event and pilot stop criteria.

### Phase 3 — bounded multilingual voice intake

Phase 3 requires separate approval. Intended work:

- evaluate Indian telephony, STT and TTS providers with costs and alternatives;
- keep providers behind adapters;
- support Hindi/English with extensible language packs;
- transcribe speech and extract only approved intake fields;
- confirm important extracted answers;
- produce a concise, labelled AI summary;
- retain transcript/source metadata according to policy;
- route low confidence and unsupported requests to a person; and
- reuse assignment, reassignment and handoff.

An LLM must never diagnose, select treatment, decide urgency or independently manage an emergency.

### Phase 4 — approved-source worker knowledge assistant

Phase 4 also requires approval. It will ingest only approved government/public-health guidance, program documents, validated FAQs and reviewed ASHA resources; retain source/version/citation metadata; answer with citations and bounded “not found” behavior; and keep patient records behind authenticated APIs. Arbitrary internet content must never enter the production knowledge base.

### Later work

Only after pilot evidence justifies it: live provider deployment, OSRM road routes, multi-district administration, notifications/jobs, refresh-token rotation and revocation, comprehensive audit reports, reference tombstones, approved encrypted offline case access and ABDM interoperability.

## Known limitations

- Clinical content is unvalidated and has documented coverage gaps.
- Visual patient confirmation and consent are incomplete.
- Anonymous upload ownership is unresolved.
- Some patient text is English-only.
- Case content requires the API.
- No provider is connected to telephone IVR.
- No speech recognition, AI summaries or RAG exist.
- Facility data is synthetic and travel is estimated.
- There is no production HTTPS termination, revocation, comprehensive audit system, job runner or approved retention schedule.
- Migration 011 cannot be applied elsewhere without target-specific review.

These limitations are part of the product truth and must remain visible in demos and handovers.
