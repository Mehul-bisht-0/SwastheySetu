# SwasthyaSetu — mobile app

Expo / React Native client. Runs the triage engine on the device, so the thing this app is
for works with the radio off.

## Run it

```bash
npm install --prefix apps/mobile     # first time, and after any dependency change
npm run dev:mobile                   # from the repo root
```

Then scan the QR code with Expo Go, or press `a` for an Android emulator.

Copy `.env.example` to `.env` first. On a physical phone, `localhost` means the phone itself —
put your machine's LAN address in `EXPO_PUBLIC_API_URL`, and the same address in the API's
`CORS_ORIGINS`.

If an import from `@swasthyasetu/core` fails to resolve, it is almost always a stale Metro
cache: `npm --prefix apps/mobile run start -- -c`.

## Why this package is not an npm workspace

The root `package.json` lists `packages/*` and `apps/api` as workspaces. `apps/mobile` is
deliberately outside that list.

React Native is unusually sensitive to duplicated copies of `react` and `react-native`, and
workspace hoisting produces exactly that — the symptom is a blank white screen or "Invalid hook
call", neither of which points at the cause. So this package installs its own `node_modules` and
reaches the two shared packages over `file:` links, which npm materialises as symlinks that
Metro follows. `metro.config.js` explains the resolver settings that make it work.

## What runs where

Triage runs entirely on the phone. `packages/core` has zero dependencies and no build step, so
Metro reads the same TypeScript sources the server does and Babel strips the types on the way
through. There is one copy of the clinical rules and neither runtime has a private fork of it.

Facility ranking also runs on the phone, against the SQLite cache in `src/db/`. The phone never
calls a routing service — travel times are precomputed at build time by
`infra/routing/precompute.ts` and shipped down through `/sync/pull`.

The network is needed for exactly three things: the first sign-in, sending the outbox, and
refreshing the facility cache. Everything else works in airplane mode, and the airplane-mode
walkthrough in `docs/DEMO.md` is the real acceptance test for this app.

## Layout

```
app/                    expo-router routes; the folder structure is the navigation
  (citizen)/            no login, no account — patient → symptoms → questions → result → facilities
  (asha)/               requires a cached session token, not a live server check
src/
  theme/tokens.ts       the design system. Colour means clinical urgency and nothing else.
  i18n/strings.ts       every user-visible string, Hindi and English
  ui/                   primitives; TierBanner and FreshnessChip are the safety-critical two
  db/                   SQLite schema, the outbox, and the DAOs
  sync/                 the push/pull runner and connectivity
  api/client.ts         the only file that calls fetch()
  state/                session and the in-progress triage draft
```

## Three rules for anything added here

**No secret ever lands in this directory.** Anything prefixed `EXPO_PUBLIC_` is inlined into the
bundle in plain text. Every model call and every database query happens on the backend;
`scripts/check-no-secrets.mjs` scans this tree and fails `npm run verify`.

**No screen decides anything clinical.** Urgency comes from `evaluateTriage`, ranking from
`rankFacilities`, both in `packages/core`. A comparator or an `if` on urgency written in a
component is how the phone and the server start disagreeing about where to send a patient.

**Never render "open" or "available" for a facility.** The backend knows when somebody last
reported something; it does not know what is true right now. The UI says "Confirmed 2 days ago".
`src/ui/FreshnessChip.tsx` is the whole user-facing surface of that rule and its header lists the
banned strings.
