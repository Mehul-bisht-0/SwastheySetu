# Architecture

<!-- PLAN: IMPLEMENTATION_PLAN.md §2 -->
<!-- STATUS: COMPLETE — the reasoning behind the structure. §2 of the plan is the summary. -->

`IMPLEMENTATION_PLAN.md` says what to build. This file says why it is shaped this way, which is
the part that is hard to recover once the code exists.

## The constraint that produced everything else

The user has no network at the moment they need the answer. Not "poor network" — none.

That single constraint decides most of the architecture. If the decision must be made on the
device, then the decision logic must run on the device. If it runs on the device, it cannot be a
large model, cannot call a service, and cannot depend on data too big to cache. What is left that
still gives a defensible clinical answer is a deterministic ruleset — which turns out to be the
right choice for a health tool anyway, for reasons that have nothing to do with connectivity.

Everything else follows: the shared zero-dependency core, the outbox, the precomputed travel
times, the district-scoped cache.

## Why rules instead of a model

A rule can be read, argued with, corrected by a clinician in an afternoon, and pinned by version
into every stored result. When a triage result is wrong, someone points at the rule and changes
it.

A model that produced the same result by inference cannot be corrected — only retrained and hoped
about. It cannot explain itself in a way a health worker can check, and it cannot be audited by
the district health officer who has to sign off on it.

There is also a plain engineering argument: fourteen predicates and an additive score fit in a
mobile bundle and run in under a millisecond. Nothing else that would fit performs as well.

The LLM has a place in this system — retrieval over approved guidance, §13 of the plan — and that
place is downstream of the decision, off the critical path, on the server, and never able to
change a tier.

## The three engines and why they stay apart

```
Decision  ──gives tier──▶  Routing  ──gives destination──▶  UI
                                │
Knowledge ──────────────────────┘  (v1: not built; never on the critical path)
```

**Decision** knows nothing about geography, networks or models. It maps an encounter to an
urgency. Its inputs are a symptom list, patient context and follow-up answers; nothing else is
allowed in, which is why it can be tested exhaustively with no fixtures beyond plain objects.

**Routing** takes urgency as given and never revisits it. It filters facilities by capability —
hard filter, not a weight — then scores what remains on capability, travel time and evidence
freshness, with weights chosen by tier.

**Knowledge** is downstream of both. If it fails, the user still has a tier and a destination.
That is the property that makes it safe to add later.

The separation is enforced by imports, not by convention: `packages/core` cannot import a model
client because it cannot import anything.

## Why the same code runs in both runtimes

`packages/core` has zero dependencies and no build step. Node 22 strips its types and runs it;
Metro reads the same `.ts` sources and Babel strips them on the way into the bundle.

The alternative — a server implementation and a mobile implementation kept in sync by discipline —
fails silently and in the worst possible way. The phone says stay home, the server says emergency,
and nobody notices until someone reconciles a database months later.

Because the phone can be running an older bundle, the server re-evaluates every report it receives
and stores both results. A mismatch is a fact worth logging, not an error worth rejecting a report
over.

## Why availability is derived and never stored

`facilities` has no `is_open` column and must never acquire one.

What the system actually has is a set of timestamped reports from people who were there. What a
boolean column would imply is knowledge of the present. The gap between those two is where a
patient travels forty kilometres to a locked door and stops trusting the app.

So freshness is computed at read time from `facility_signals`, with exponential decay
(τ = 14 days), and it reaches the screen as evidence and an age — *"Confirmed 2 days ago"* — never
as a status. The design system enforces the same thing from the other side: freshness has no
colour, because green would be read as "open" no matter what the text said.

## Why the outbox, and why it is boring

Field connectivity does not fail cleanly. It fails as a request that appears to succeed, a socket
that hangs for ninety seconds, a phone that dies mid-flush.

The outbox pattern answers all three the same way: write the record and its queue entry in one
local transaction before telling the user anything, and remove the queue entry only on a named
acknowledgement from the server. A client-generated UUID makes the retry safe, and a server-side
ledger keyed on that UUID makes a replay a no-op that returns the original answer.

None of this is novel and that is the point. It is the well-understood solution, applied properly,
to the failure mode that actually occurs.

## Why travel times are precomputed

Live routing would be marginally more accurate and would make the core feature depend on a service
being reachable, which contradicts the constraint at the top of this document.

OSRM therefore runs once at build time over a district extract and writes a village × facility
matrix into Postgres, which syncs to the phone. Rural road networks do not change between demos.
Where a pair is missing, ranking falls back to straight-line distance and the UI says so rather
than inventing a number.

## What was deliberately not built

No message queue, no cache layer, no microservices, no analytics pipeline, no admin dashboard.
None of them makes the vertical slice work, and each is a component that can be down during a
demo. Guardrail 9 exists because infrastructure is the most common way a hackathon project
becomes impressive and non-functional at the same time.

## Where this would break at real scale

Recorded honestly, since the prototype does not reach any of them:

- The facility cache is district-scoped by design. Multi-district workers, or a state-level
  deployment, need a different cache strategy than "pull the district".
- `sync_operations` grows without bound; a real deployment needs retention.
- Facility signals are unweighted by reporter. In the field, a signal from an ASHA and one from an
  anonymous user are not equally reliable, and the freshness model has no notion of that.
- There is no supervisory view, so nobody can see that a village stopped reporting.
