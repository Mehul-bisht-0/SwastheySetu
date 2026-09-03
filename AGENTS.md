# AGENTS.md — read this first

You are implementing **SwasthyaSetu**, an offline-first rural healthcare decision-support prototype.
The full specification is `IMPLEMENTATION_PLAN.md`. This file tells you how to work through the skeleton.

---

## 1. The one rule that matters most

There are **three separate engines**. They must never call each other's territory.

| Engine | Lives in | Answers |
|---|---|---|
| Decision | `packages/core/src/triage` | "How urgent is this?" |
| Routing | `packages/core/src/facilities` + `apps/api/src/modules/routing` | "Where should this person go?" |
| Knowledge | `apps/api/src/modules/rag` (**not built in v1**) | "What does approved guidance say?" |

**An LLM must never decide urgency, diagnose, or invent facility availability.**
If you find yourself importing an AI client into triage or facilities code, stop — you have misread the task.

---

## 2. File status markers

Every file starts with a header block. The `STATUS:` line tells you what to do.

```
STATUS: COMPLETE — do not modify
```
The file is finished and correct. SQL migrations, type definitions, the red-flag ruleset, design
tokens, and all tests are pre-written. **Do not rewrite them.** They are the specification.
If your code disagrees with a COMPLETE file, your code is wrong.

```
STATUS: STUB — implement the function bodies
```
Signatures, doc comments, and step-by-step instructions are given. Write the bodies.
Do not change exported signatures — other files already import them.

```
STATUS: SCAFFOLD — replace placeholder content
```
Mostly for UI screens and data files. Structure is sketched; build it out.

---

## 3. Relative imports must end in `.ts` — not `.js`, not bare

This is the first thing that will break for you, so it comes before everything else.

```ts
import { evaluateRedFlags } from "./redFlags.ts";   // ✅ correct
import { evaluateRedFlags } from "./redFlags.js";   // ❌ ERR_MODULE_NOT_FOUND at runtime
import { evaluateRedFlags } from "./redFlags";      // ❌ NodeNext rejects extensionless
```

Node 22 runs TypeScript by **stripping the types out of the source file and executing what is
left**. There is no compile step and no emitted `.js`, so there is nothing for `./redFlags.js` to
resolve to. Node does not guess. Under `module: "NodeNext"` an extensionless specifier is a hard
error too, so `.ts` is the only spelling that works.

Three compiler options in `tsconfig.base.json` make this legal and keep the emitted declarations
correct — `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `emitDeclarationOnly`.
Leave them on.

`erasableSyntaxOnly: true` is on for the same reason: `enum`, `namespace` and constructor parameter
properties cannot be erased by a type stripper. Use a `const` object with `as const` instead of an
enum (see `CAP` in `packages/core/src/facilities/capability.ts`). The compiler will reject the
alternatives before Node can crash on them.

Package imports (`node:test`, `zod`, `fastify`) are unaffected — no extension, as usual.

---

## 4. How to implement a STUB file

Each stub header gives you everything needed. Work in this order:

1. **Read the header.** It lists `MAY IMPORT`, `MUST NOT IMPORT`, exports, and numbered steps.
2. **Read the test file** next to it (`*.test.ts`). The tests are complete and are the real spec.
3. **Write the body.** Follow the numbered steps literally.
4. **Run the test.** `npm run test:core` (no install needed — Node 22 runs TypeScript directly).
5. **Do not move on until it is green.**

Every stub body currently throws `NOT_IMPLEMENTED`. That is intentional: typecheck passes, runtime
fails loudly, and nothing silently returns a wrong medical answer.

---

## 5. Build order

Follow `IMPLEMENTATION_PLAN.md` §14. Each phase ends green before the next begins.

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

**Phase 1 is the best starting point.** It needs no database, no network, and no installed packages —
just `node --test`. Get the safety layer green first.

`apps/mobile` is **not** an npm workspace and is not in the `tsc -b` project graph. Install it
separately with `npm install --prefix apps/mobile` and typecheck it with
`npm --prefix apps/mobile run typecheck`. `apps/mobile/README.md` explains why — the short version
is that workspace hoisting gives React Native two copies of `react` and the failure presents as a
blank white screen.

---

## 6. Hard constraints

- **`packages/core` has zero dependencies.** No npm imports, no `node:*` imports, no `Date.now()`
  inside pure functions (a `Clock` is passed in), no `fetch`, no `process`. It runs on a phone and
  on a server, unchanged. This is why the safety logic can run offline.
- **Never use `any`.** `strict: true` is on everywhere.
- **Never write string-interpolated SQL.** Every query is parameterised (`$1`, `$2`).
- **Never put a secret in `apps/mobile`.** `npm run verify` greps for this and fails the build.
- **Never render the words "open" or "available"** for a facility. The UI states evidence and its
  age: "Confirmed 2 days ago". See `IMPLEMENTATION_PLAN.md` §6.6.
- **Business logic goes in `service.ts`, SQL in `repo.ts`, HTTP only in `routes.ts`.** A route handler
  containing a ranking decision or an `if` on urgency is a bug.

---

## 7. When something is genuinely undecided

Search for `DECIDE:` in the plan and in file headers. Those are open questions that need a human.
Do not guess and move on silently — leave the marker and say so in your summary.

The known open one: no official Docker image ships both PostGIS and pgvector, so
`infra/Dockerfile.db` builds from the PostGIS base and adds pgvector. Verify both
`CREATE EXTENSION` calls succeed in Phase 0 — it is the most likely early blocker.

---

## 8. Honesty requirements

This is a health-adjacent prototype. Three things must stay true in code and in the demo:

1. The rules are **not clinically validated**. `docs/SAFETY.md` records each rule's source and
   states that no clinician has reviewed them. Do not remove that.
2. Facility freshness is **evidence age**, not live availability.
3. `README.md` keeps an accurate implemented-vs-planned table. RAG is planned, not built.
