# Scenario fixtures

<!-- PLAN: IMPLEMENTATION_PLAN.md §6.3, §14.2 -->
<!-- STATUS: COMPLETE — add fixtures freely; do not edit one to make a test pass. -->

Ten encounters and the answer the system must give for each. `../scenarios.test.ts` runs them all
against `evaluateTriage`, and `npm run test:scenarios` (part of `npm run verify`) is the command.

These exist so that **a change to a clinical rule breaks something visible.** The unit tests in
`packages/core` check that each function behaves; these check that the system as a whole still
gives the same clinical answers it gave yesterday.

## Format

```jsonc
{
  "id":        "03-pregnancy-unknown-bleeding",   // matches the filename
  "title":     "Heavy bleeding, pregnancy status unknown",
  "comment":   "WHY this case exists and what breaks if it is deleted",
  "encounter": { "patient": {...}, "symptoms": [...], "answers": {...} },
  "expect": {
    "tier":         "EMERGENCY",
    "ruleIds":      ["RF_PREG_BLEEDING"],   // all must fire; [] means none did
    "requiredTags": ["DELIVERY", "CAESAREAN"],  // optional
    "minLevel":     3                            // optional
  }
}
```

`encounter` is exactly core's `Encounter` type. Symptom codes must be members of `SymptomCode` in
`packages/core/src/triage/types.ts`; a typo produces a fixture that passes for the wrong reason.

## When one of these fails

**Read the `comment` field first.** It says what the case was protecting.

If the rule change was intended, update the fixture in the *same commit* as the rule, record the
change and its source in `docs/SAFETY.md`, and put the reason in the commit message. If it was not
intended, you have found the bug this directory exists to find.

A fixture edited to make a test go green has been deleted, whatever the diff says.

## What the set covers

| Fixture | Protects |
|---|---|
| `01-infant-fever` | Age alone can make something an emergency |
| `02-child-fast-breathing` | The demo case in `docs/DEMO.md` |
| `03-pregnancy-unknown-bleeding` | `mayBePregnant` treats unknown as pregnant |
| `04-preeclampsia-signs` | Multi-sign combination rules |
| `05-stroke-signs` | Time-critical case where the patient is awake and talking |
| `06-multiple-red-flags` | Every matching rule is reported, not the first |
| `07-bloody-diarrhoea-child` | The middle of the ladder works — `GO_NOW`, not `EMERGENCY` |
| `08-mild-adult-self-care` | The system is willing to say "stay home" |
| `09-classifier-must-not-downgrade` | GUARDRAIL 8 — the classifier never runs after a red flag |
| `10-chest-pain-age-boundary` | Off-by-one in an age threshold |

Gaps are listed in `docs/SAFETY.md` §3. Writing a fixture first, watching it fail, then fixing the
rule is the right response to any bug found in the ruleset.
