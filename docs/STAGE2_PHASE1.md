# Stage 2 Phase 1 — worker assignment and human handoff

STATUS: Implemented; verification results recorded below. Prototype/synthetic data only.

## Approved access and assignment decisions

The user approved one primary ASHA per village, supervisor-managed reassignment,
and an unassigned queue. Supervisors see assignment metadata only. Full intake
and transcript are accessible only to the currently assigned ASHA. Administrators
have the same metadata-only management access; they do not bypass content checks.
Existing household-visit access remains unchanged, consistent with `docs/SAFETY.md`.

SQL checks the active database user, role and district on every request rather
than relying on potentially stale JWT role claims. Case detail reads are audited.
Changing the roster affects future intake only; existing cases require explicit
reassignment. An inactive/missing primary worker results in an unassigned case.

## Workflow

Open **Case inbox** from the ASHA home screen. Supervisors configure the village
roster and assign/reassign cases there. ASHAs read their cases, acknowledge receipt,
request human handoff with a bounded operational reason, and record completed
human follow-up. The supervisor selects a worker before assigning an inbox case.
Roster removal leaves future cases unassigned and does not revoke existing ownership.

States: UNASSIGNED → ASSIGNED → ACKNOWLEDGED → CLOSED. An assigned or acknowledged
case can request HANDOFF_REQUESTED; its current owner remains responsible until a
supervisor reassigns it. Reassignment resets acknowledgement. Closed cases cannot
be reassigned or reopened in this phase. Optimistic versions and row locks prevent
simultaneous edits from silently overwriting each other.

Handoff reasons are operational: caller request, difficulty understanding,
unsupported request, or worker unable to continue. No urgency is inferred from
free text. This is an asynchronous human-work queue, not a live call transfer or
an emergency response service. No response-time promise or clinical escalation
threshold has been invented. Staffing and emergency procedures still need review.

## Intake and identity boundary

The authenticated synthetic intake seam stores explicitly confirmed basic details,
location, contact, reason, optional context/concerns/timing/callback/notes, optional
transcript, language and consent timestamps. The UI submits a fixed fictional case
after a test consent confirmation. The API requires `synthetic: true`; this is a
prototype-use declaration, not a detector that can prove text is fictional.
Do not submit real caller data.

No person master or identity-verification system exists to reuse. Each interaction
gets a distinct case ID; phone numbers are neither unique identities nor authority
to disclose prior cases. Linking real people/cases is deferred to an approved
identity workflow. No audio is stored. AI summaries are explicitly absent until
Phase 3; the inbox never labels a template as an AI-generated summary.

Hindi and English UI are supported. Later languages require extending the shared
language schema and localized text, not replacing assignment services. Phase 2/3
must add reviewed caller prompts and provider authentication before exposing an
intake submission endpoint to telephony.

## Storage, retention and deployment

Migration 012 adds `village_worker_assignments`, `intake_cases`, and metadata-only
`worker_assignment_events`. It changes no clinical engine or existing table.
No third-party dependency or paid service is introduced.

Set `CASE_RETENTION_DAYS` explicitly (integer 1–3650) for the chosen test environment.
There is deliberately no default policy. Changing it affects new cases/events;
existing expiry dates remain as recorded. Expired cases cannot be read or changed.
Run the following against the intended database to remove expired content and
case audit events together, plus expired standalone roster events:

```powershell
node --env-file=.env scripts/purge-expired-cases.ts
```

This command prints counts only. Schedule it in the eventual deployment scheduler;
no background service is started by this change. Backups, provider copies and
production retention require formal review. The inbox uses `Cache-Control: no-store`,
does not enter SQLite/outbox/reference sync, and clears component content on blur
or application background. Previously viewed information cannot be recalled from
a human; subsequent server reads by an old assignee are denied after reassignment.
Physical-device background/screenshot behavior is still a manual acceptance check.

Migration 011 remains restricted to the isolated test database. Its source review
is in `MIGRATION_011_REVIEW.md`; do not apply 011 or run the migration chain on
another database without the required target-specific review/approval.

## API and tests

All endpoints below require authentication; district and role come from the active
database user. Supervisors never receive a sensitive-content response.

| Endpoint | Purpose |
|---|---|
| GET /assignments/directory | District villages and roster; managers also receive active worker choices |
| POST /assignments/roster | Manager sets/removes primary worker for a village |
| GET /assignments/cases?offset=0 | 50 metadata items, newest first; ASHAs scoped to ownership |
| POST /assignments/cases | ASHA submits consented, confirmed synthetic interaction |
| GET /assignments/cases/:id | Assigned ASHA reads content; audited |
| POST /assignments/cases/:id | Versioned acknowledgement, handoff, closure or manager reassignment |
| GET /assignments/cases/:id/history | Scoped metadata-only audit history, most recent 100 events |

Case IDs are unique; duplicate creation returns conflict without overwriting data.
The test UI is not a durable public caller submission queue. A future telephony
adapter must persist its interaction ID across retries and implement authenticated
provider receipt/reconciliation. Offset paging is suitable for a small prototype;
refresh when new cases arrive. No automated overdue threshold or notification is
configured; supervisors must inspect unassigned and handoff states.

`apps/api/test/assignments.test.ts` exercises privacy across roles and districts,
unassigned cases, roster behavior, handoff ownership, concurrent reassignment,
stale versions, consent, duplicate writes, inactive users and retention. It only
writes to an explicitly configured `NODE_ENV=test` database ending in `_test` and
uses its own district/users/villages. It cleans up those fixtures after testing.

Validation (2026-09-06): `npm run verify` passed against the existing isolated
`swasthyasetu_test` database: both typechecks, 126 core tests, 13 scenario checks,
5 mobile storage tests, 35 API tests and the mobile secret scan. The 35 passing API
tests include all six new Phase 1 integration tests; none of those six were skipped.
The 18 protected legacy API skips remain as documented in the stabilization report.
Android export also passed. Physical-device interaction, airplane-mode messaging,
and background/force-quit acceptance remain manual checks.

Migration 012 was applied only to that isolated database; the runner confirmed
011 was already applied there. No other database received either migration.
Docker Desktop had to be recovered and the existing isolated container restarted
before live integration tests could run. No test pass is inferred from the earlier
database-unreachable run.

Phase 2 (phone-line keypad IVR) is now implemented as a provider-neutral
prototype; see `docs/STAGE2_PHASE2.md`. Phase 3 (bounded voice and AI summaries)
and Phase 4 (approved-source worker RAG) remain unimplemented and require their
separate phase approvals. Clinical validation and formal privacy/consent/identity
review remain outstanding.
