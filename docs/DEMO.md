# Demo script — the airplane-mode walkthrough

<!-- PLAN: IMPLEMENTATION_PLAN.md §14.1 -->
<!-- STATUS: COMPLETE — this is also the acceptance test for phases 7–9. -->

This is not a slideshow. It is the acceptance test for the mobile app, written as a walkthrough,
and if it passes on a real phone the project works.

Total running time about seven minutes. **Do it on a physical device, not a simulator** — the
whole argument is about a cheap phone with no signal, and a simulator toggling wifi does not make
that argument.

## Before you start

```bash
npm run db:up && npm run db:migrate && npm run db:seed
npm run dev:api
npm install --prefix apps/mobile && npm run dev:mobile
```

`.env` in `apps/mobile` needs `EXPO_PUBLIC_API_URL` set to your machine's **LAN address**, not
`localhost` — on a physical phone `localhost` is the phone. Put the same address in the API's
`CORS_ORIGINS`.

Sign in as the demo ASHA once while online, then let the app pull reference data. Confirm the
queue screen reads "Everything has been sent" before you begin.

## 1. Turn the network off first

Enable airplane mode **in front of the audience**, before anything else, and leave it on for the
next four minutes. The offline strip appears at the top of the screen and stays there.

Say what it means: from here on, nothing is reaching a server.

## 2. The citizen path — no login at all

Open the app fresh and choose "I am a patient or family member". There is no sign-in step and
there is no account. A frightened parent at 2am does not have a password.

Enter a child of 14 months, then choose fever and fast breathing.

The result appears **immediately** — no spinner, because nothing is being fetched. The banner
reads *Go to hospital now*, with the octagon mark, and below it the reasons name the rule that
fired: a young child breathing fast. Under that, in the same size text, the line that must never
be removed: *"This is not a diagnosis. It only tells you how soon to get help."*

Point at the reason. This is the part that distinguishes the system: the answer is not a model's
opinion, it is a named rule that a clinician can read and change.

## 3. Where to go — and what the app refuses to say

Tap "Find care nearby". The list is ranked by capability first, because the tier is an emergency —
the nearest sub-centre is not at the top, and the reason line says why.

Each facility carries a freshness chip. Read one out loud: *"Confirmed 2 days ago."*

Then say the thing worth saying: the app does not tell you it is open, because it does not know.
It knows when somebody last reported. Above the list is one line — *"Call before you set out."*
That is the honest instruction, and it is the difference between a demo and a system.

If a facility shows *"Someone reported 3 days ago that this was not working"*, point at it: a
recent negative report outranks an older positive one, on purpose.

## 4. The ASHA path — work that survives

Switch to the ASHA section. You are still signed in, still in airplane mode: the session was
cached, not re-checked against a server.

Record three household visits. Each one saves instantly and says so: *"Saved on this phone. It
will send itself when you have internet."* The queue badge counts up to three.

## 5. Force-quit the app

Kill it from the task switcher, in front of the audience, then reopen it.

The queue still reads three. Nothing was in memory waiting to be flushed — each write committed to
SQLite in the same transaction as its outbox row, before the screen ever said "saved".

## 6. Turn the network back on

Leave airplane mode. The strip changes, the runner pushes, the queue empties to *"Everything has
been sent"*.

## 7. The part nobody demos: send it twice

On the queue screen, tap "Send now" again.

Nothing duplicates. In `psql`, `SELECT count(*) FROM household_visits` still returns three,
because each operation carried a client-generated id and the server's ledger recognised the
replay and returned the stored result rather than applying it a second time.

This is the least visual thirty seconds of the demo and the most important. A field app that
double-records a household on a flaky network is worse than no app.

## 8. Close on the about screen

Open About. It shows what is built and what is not — RAG is listed as planned, not built — and it
states at full size that the rules are **not clinically validated**.

If a judge asks whether this is safe to deploy: no. The rules need a clinician. What the
architecture provides is that a clinician can read every rule, change one, and see exactly which
test breaks.

## Failure modes to rehearse

| If | Then |
|---|---|
| The device cannot reach the API on the LAN | Check `EXPO_PUBLIC_API_URL` is the LAN IP and `CORS_ORIGINS` matches. Rehearse the offline half regardless — it needs no server. |
| An import from `@swasthyasetu/core` fails | Stale Metro cache: `npm --prefix apps/mobile run start -- -c` |
| The facility list is empty | `npm run db:seed` did not run, or `infra/seed/*.csv` are still empty (see `infra/seed/PROVENANCE.md`) |
| Travel times are missing | Expected without OSRM. Ranking falls back to straight-line distance and the UI says "distance only" — say so rather than hiding it. |
