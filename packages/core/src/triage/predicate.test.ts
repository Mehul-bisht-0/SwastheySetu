/**
 * FILE: packages/core/src/triage/predicate.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.2
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 1
 *
 * Run: npm run test:core
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Encounter } from "./types.ts";
import { evalPredicate, mayBePregnant } from "./predicate.ts";

function enc(over: Partial<Encounter> = {}): Encounter {
  return {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: [],
    answers: {},
    ...over,
  };
}

// ------------------------------------------------------------ mayBePregnant

test("mayBePregnant: explicit yes is always true", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "yes" } });
  assert.equal(mayBePregnant(e), true);
});

test("mayBePregnant: explicit no is always false", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "no" } });
  assert.equal(mayBePregnant(e), false);
});

test("mayBePregnant: SAFETY — unknown + female + reproductive age is TRUE", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" } });
  assert.equal(
    mayBePregnant(e),
    true,
    "an unanswered pregnancy question must not silently drop obstetric red flags",
  );
});

test("mayBePregnant: unknown outside reproductive age is false", () => {
  const young = enc({ patient: { ageMonths: 143, sex: "female", pregnancy: "unknown" } });
  const old = enc({ patient: { ageMonths: 601, sex: "female", pregnancy: "unknown" } });
  assert.equal(mayBePregnant(young), false);
  assert.equal(mayBePregnant(old), false);
});

test("mayBePregnant: reproductive-age bounds are inclusive", () => {
  const lo = enc({ patient: { ageMonths: 144, sex: "female", pregnancy: "unknown" } });
  const hi = enc({ patient: { ageMonths: 600, sex: "female", pregnancy: "unknown" } });
  assert.equal(mayBePregnant(lo), true);
  assert.equal(mayBePregnant(hi), true);
});

test("mayBePregnant: unknown + male is false", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "male", pregnancy: "unknown" } });
  assert.equal(mayBePregnant(e), false);
});

// ------------------------------------------------------------ evalPredicate

test("hasSymptom / hasAnySymptom", () => {
  const e = enc({ symptoms: ["FEVER", "COUGH"] });
  assert.equal(evalPredicate({ op: "hasSymptom", code: "FEVER" }, e), true);
  assert.equal(evalPredicate({ op: "hasSymptom", code: "RASH" }, e), false);
  assert.equal(
    evalPredicate({ op: "hasAnySymptom", codes: ["RASH", "COUGH"] }, e),
    true,
  );
  assert.equal(
    evalPredicate({ op: "hasAnySymptom", codes: ["RASH", "INJURY"] }, e),
    false,
  );
  assert.equal(evalPredicate({ op: "hasAnySymptom", codes: [] }, e), false);
});

test("age comparisons use months and are half-open at the boundary", () => {
  const e = enc({ patient: { ageMonths: 60, sex: "male", pregnancy: "no" } });
  assert.equal(evalPredicate({ op: "ageMonthsLt", value: 60 }, e), false);
  assert.equal(evalPredicate({ op: "ageMonthsLt", value: 61 }, e), true);
  assert.equal(evalPredicate({ op: "ageMonthsGte", value: 60 }, e), true);
  assert.equal(evalPredicate({ op: "ageMonthsGte", value: 61 }, e), false);
});

test("isPregnant is strict; mayBePregnant is the safety-widened form", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" } });
  assert.equal(evalPredicate({ op: "isPregnant" }, e), false);
  assert.equal(evalPredicate({ op: "mayBePregnant" }, e), true);
});

test("answerEquals uses strict equality across types", () => {
  const e = enc({ answers: { DRINKING: "poorly", BLOOD_IN_STOOL: true, PAIN_SCORE: 7 } });
  assert.equal(
    evalPredicate({ op: "answerEquals", questionId: "DRINKING", value: "poorly" }, e),
    true,
  );
  assert.equal(
    evalPredicate({ op: "answerEquals", questionId: "DRINKING", value: "unable" }, e),
    false,
  );
  assert.equal(
    evalPredicate({ op: "answerEquals", questionId: "BLOOD_IN_STOOL", value: true }, e),
    true,
  );
  assert.equal(
    evalPredicate({ op: "answerEquals", questionId: "PAIN_SCORE", value: 7 }, e),
    true,
  );
  assert.equal(
    evalPredicate({ op: "answerEquals", questionId: "NOT_ASKED", value: true }, e),
    false,
  );
});

test("answerGte requires an actual number", () => {
  const e = enc({ answers: { FEVER_DAYS: 3, DURATION_HOURS: "48" } });
  assert.equal(
    evalPredicate({ op: "answerGte", questionId: "FEVER_DAYS", value: 3 }, e),
    true,
  );
  assert.equal(
    evalPredicate({ op: "answerGte", questionId: "FEVER_DAYS", value: 4 }, e),
    false,
  );
  assert.equal(
    evalPredicate({ op: "answerGte", questionId: "DURATION_HOURS", value: 24 }, e),
    false,
    "a string must not be coerced to a number",
  );
  assert.equal(
    evalPredicate({ op: "answerGte", questionId: "MISSING", value: 0 }, e),
    false,
  );
});

test("answerMissing treats absent and null alike", () => {
  const e = enc({ answers: { A: 1 } });
  assert.equal(evalPredicate({ op: "answerMissing", questionId: "A" }, e), false);
  assert.equal(evalPredicate({ op: "answerMissing", questionId: "B" }, e), true);
});

test("all / any / not, including empty-array identities", () => {
  const e = enc({ symptoms: ["FEVER"] });
  const yes = { op: "hasSymptom", code: "FEVER" } as const;
  const no = { op: "hasSymptom", code: "RASH" } as const;

  assert.equal(evalPredicate({ op: "all", of: [yes, yes] }, e), true);
  assert.equal(evalPredicate({ op: "all", of: [yes, no] }, e), false);
  assert.equal(evalPredicate({ op: "all", of: [] }, e), true, "empty all() is true");

  assert.equal(evalPredicate({ op: "any", of: [no, yes] }, e), true);
  assert.equal(evalPredicate({ op: "any", of: [no, no] }, e), false);
  assert.equal(evalPredicate({ op: "any", of: [] }, e), false, "empty any() is false");

  assert.equal(evalPredicate({ op: "not", of: no }, e), true);
  assert.equal(evalPredicate({ op: "not", of: yes }, e), false);
});

test("predicates nest to arbitrary depth", () => {
  const e = enc({
    patient: { ageMonths: 30, sex: "female", pregnancy: "no" },
    symptoms: ["DIARRHOEA"],
    answers: { BLOOD_IN_STOOL: true },
  });
  const p = {
    op: "all",
    of: [
      { op: "hasSymptom", code: "DIARRHOEA" },
      { op: "ageMonthsLt", value: 60 },
      {
        op: "any",
        of: [
          { op: "answerEquals", questionId: "BLOOD_IN_STOOL", value: true },
          { op: "not", of: { op: "hasSymptom", code: "FEVER" } },
        ],
      },
    ],
  } as const;
  assert.equal(evalPredicate(p, e), true);
});

test("evaluation is pure — the encounter is not mutated", () => {
  const e = enc({ symptoms: ["FEVER"], answers: { A: 1 } });
  const before = JSON.stringify(e);
  evalPredicate({ op: "all", of: [{ op: "hasSymptom", code: "FEVER" }] }, e);
  assert.equal(JSON.stringify(e), before);
});
