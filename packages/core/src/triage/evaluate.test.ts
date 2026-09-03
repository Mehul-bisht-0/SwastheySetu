/**
 * FILE: packages/core/src/triage/evaluate.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.5
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 1
 *
 * This file guards the single most important property in the codebase:
 * a red flag decides the outcome and the classifier never gets a vote.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Encounter } from "./types.ts";
import { NON_DIAGNOSTIC_DISCLAIMER } from "./types.ts";
import type { RedFlagRule } from "./redFlags.ts";
import type { UrgencyClassifier } from "./classifier.v1.ts";
import { evaluateTriage, adviceForTier } from "./evaluate.ts";
import { RULESET_VERSION } from "./ruleset.v1.ts";
import { fixedClock } from "../util/clock.ts";

const NOW = "2026-03-10T08:30:00.000Z";
const clock = fixedClock(NOW);

function enc(over: Partial<Encounter> = {}): Encounter {
  return {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: [],
    answers: {},
    ...over,
  };
}

/** Explodes if the classifier is consulted. This is the test, not a mock detail. */
const explodingClassifier: UrgencyClassifier = {
  version: "must-never-run",
  classify() {
    throw new Error("the classifier ran after a red flag fired");
  },
};

const stubClassifier: UrgencyClassifier = {
  version: "stub-v0",
  classify() {
    return { tier: "PHC_SOON", score: 3.2, features: { stub: 1 } };
  },
};

// ------------------------------------------------------------ red-flag path

test("GUARDRAIL 8: when a red flag fires, the classifier is NEVER called", () => {
  const result = evaluateTriage(enc({ symptoms: ["UNCONSCIOUS"] }), {
    clock,
    classifier: explodingClassifier,
  });
  assert.equal(result.tier, "EMERGENCY");
  assert.equal(result.decisionSource, "RED_FLAG");
  assert.equal(result.classifier, undefined, "no classifier output on a red-flag result");
});

test("a red-flag result lists every matching reason", () => {
  const result = evaluateTriage(
    enc({
      patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" },
      symptoms: ["BLEEDING_HEAVY"],
    }),
    { clock, classifier: explodingClassifier },
  );
  assert.deepEqual(
    result.redFlagHits.map((h) => h.ruleId),
    ["RF_PREG_BLEEDING", "RF_HEAVY_BLEEDING_ANY"],
  );
});

test("advice from multiple hits is concatenated, de-duplicated, order preserved", () => {
  const rules: RedFlagRule[] = [
    {
      id: "RF_A",
      tier: "GO_NOW",
      label: "A",
      advice: ["Go today.", "Take ORS."],
      when: { op: "hasSymptom", code: "FEVER" },
    },
    {
      id: "RF_B",
      tier: "EMERGENCY",
      label: "B",
      advice: ["Take ORS.", "Go now."],
      when: { op: "hasSymptom", code: "FEVER" },
    },
  ];
  const result = evaluateTriage(enc({ symptoms: ["FEVER"] }), {
    clock,
    rules,
    classifier: explodingClassifier,
  });
  assert.equal(result.tier, "EMERGENCY", "most severe hit wins");
  assert.deepEqual(result.advice, ["Go today.", "Take ORS.", "Go now."]);
});

test("the most severe tier wins even when a milder rule matched first", () => {
  const result = evaluateTriage(
    enc({
      patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
      symptoms: ["REDUCED_FETAL_MOVEMENT", "CONVULSION"],
    }),
    { clock, classifier: explodingClassifier },
  );
  assert.equal(result.tier, "EMERGENCY");
});

// ------------------------------------------------------------ classifier path

test("with no red flag, the classifier decides and its output is attached", () => {
  const result = evaluateTriage(enc({ symptoms: ["RASH"] }), {
    clock,
    classifier: stubClassifier,
  });
  assert.equal(result.decisionSource, "CLASSIFIER");
  assert.equal(result.tier, "PHC_SOON");
  assert.deepEqual(result.redFlagHits, []);
  assert.ok(result.classifier);
  assert.equal(result.classifier.score, 3.2);
  assert.equal(result.classifier.version, "stub-v0");
  assert.deepEqual(result.classifier.features, { stub: 1 });
});

test("the default classifier is used when none is injected", () => {
  const result = evaluateTriage(enc({ symptoms: ["RASH"] }), { clock });
  assert.equal(result.decisionSource, "CLASSIFIER");
  assert.ok(result.classifier);
  assert.match(result.classifier.version, /^classifier-v/);
});

// ------------------------------------------------------------ always stamped

test("every result carries version, timestamp and the non-diagnostic notice", () => {
  for (const e of [enc({ symptoms: ["UNCONSCIOUS"] }), enc({ symptoms: ["RASH"] })]) {
    const result = evaluateTriage(e, { clock });
    assert.equal(result.rulesetVersion, RULESET_VERSION);
    assert.equal(result.evaluatedAt, NOW);
    assert.equal(result.disclaimer, NON_DIAGNOSTIC_DISCLAIMER);
    assert.ok(result.advice.length > 0, "a result with no advice is useless");
  }
});

test("time comes from the injected clock, never from Date.now()", () => {
  const other = fixedClock("2020-01-01T00:00:00.000Z");
  const result = evaluateTriage(enc({ symptoms: ["RASH"] }), { clock: other });
  assert.equal(result.evaluatedAt, "2020-01-01T00:00:00.000Z");
});

test("identical input and clock produce byte-identical results", () => {
  const e = enc({ symptoms: ["FEVER"], answers: { DURATION_HOURS: 30 } });
  assert.equal(
    JSON.stringify(evaluateTriage(e, { clock })),
    JSON.stringify(evaluateTriage(e, { clock })),
  );
});

test("evaluation does not mutate the encounter", () => {
  const e = enc({ symptoms: ["FEVER"], answers: { DURATION_HOURS: 30 } });
  const before = JSON.stringify(e);
  evaluateTriage(e, { clock });
  assert.equal(JSON.stringify(e), before);
});

// ------------------------------------------------------------ advice copy

test("adviceForTier gives actions for each classifier-reachable tier", () => {
  for (const tier of ["GO_NOW", "PHC_SOON", "SELF_CARE"] as const) {
    const advice = adviceForTier(tier);
    assert.ok(advice.length > 0, `${tier} has no advice`);
    for (const line of advice) assert.ok(line.trim().length > 0);
  }
});

test("SELF_CARE advice is a conditional discharge, never a dismissal", () => {
  const advice = adviceForTier("SELF_CARE").join(" ").toLowerCase();
  assert.equal(advice.includes("nothing to worry"), false);
  assert.equal(advice.includes("you are fine"), false);
});

test("adviceForTier throws for EMERGENCY — that tier is red-flag territory", () => {
  assert.throws(() => adviceForTier("EMERGENCY"));
});
