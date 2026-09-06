# Stage 2 Phase 2 — keypad telephone IVR

Phase 2 adds a deterministic DTMF state machine behind an authenticated,
provider-neutral webhook. It uses Phase 1's village roster, atomic worker
assignment, unassigned queue, case access controls, handoff status and audit.
It does not call the triage engine, diagnose, select treatment, use speech
recognition, generate speech with AI, retain audio, or use RAG.

## Prototype call flow

1. Choose Hindi (1) or English (2).
2. Hear the automated-system, no-recording and storage notice; consent (1) or
   decline (2). A declined call stores no case.
3. Identify whether the caller is calling for themselves or another person.
4. Enter a configured village dial code followed by `#`.
5. Select a non-diagnostic reason category.
6. Select a broad duration/timing band, including unknown.
7. Allow callback to the calling number, enter another number, or decline
   callback permission.
8. Hear the important structured selections and confirm submission, or restart
   the intake to correct them.
9. Create a case and use the Phase 1 primary-ASHA assignment. Missing roster
   configuration produces an unassigned case. “Other or unsure” creates a
   `HANDOFF_REQUESTED` indicator.

Invalid input and silence are retried using configurable limits. Once consent
and a valid village checkpoint exist, exhausted retries or hang-up create an
explicitly incomplete case for human review. Earlier failures do not create a
case because the service cannot safely route it or lacks consent. Calls never
claim that emergency help or a callback has been dispatched.

## Provider boundary and configuration

`POST /ivr/webhooks/prototype` accepts normalized `START`, `DTMF`, `TIMEOUT` and
`HANGUP` events and returns provider-neutral `PLAY`, `GATHER` and `HANGUP`
commands. `x-ivr-webhook-secret` must match the server-only
`IVR_WEBHOOK_SECRET` (minimum 32 characters). Provider event IDs are stored
without raw request bodies and replayed idempotently; concurrent duplicate
events serialize before state changes.

Hindi/English prompts, menu digits, categories, retry limits and timeouts live
in `apps/api/src/modules/ivr/config.ts`. Village routing lives in
`ivr_village_routes`, allowing pilot operators to map short numeric codes to
villages without code changes. A real provider adapter must translate its
signed webhook into the normalized event and translate commands into its call
control format. The prototype adapter intentionally avoids choosing or buying a
telephony vendor.

## Data and retention

Migration 013 adds IVR sessions, replay metadata and village dial-code routing;
it marks cases as `KEYPAD_IVR` and complete/incomplete. It makes the Phase 1
`created_by` and audit actor nullable for system-created call cases. IVR session
responses contain structured keypad choices and necessary phone/contact data;
raw webhook bodies and audio are not stored. Case/session/provider-event expiry
uses the explicit `CASE_RETENTION_DAYS` setting. The purge script now removes
expired IVR rows as well as Phase 1 cases.

Supervisors continue to receive assignment metadata only. The existing inbox
shows IVR origin and incomplete status; full structured content and callback
details remain available only to the assigned ASHA. Final consent, privacy,
identity, callback and retention policy still requires formal review before a
real-world pilot.

## Verification boundary

Migration 013 was applied only to the existing isolated
`swasthyasetu_test` database on port 55432. The runner reported Migration 011
was already present there. No other database was migrated.

A live phone call still requires selection/procurement of an Indian inbound
number, a provider-specific adapter and reviewed recordings for every prompt.
Those are deployment decisions, not Phase 3 voice-AI work.
