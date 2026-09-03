/**
 * FILE: packages/core/src/triage/classifier.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.4
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 1
 *
 * The three calibration cases below pin the scorecard. If you change WEIGHTS or
 * a threshold, these numbers move — recompute them deliberately and record the
 * reason in docs/SAFETY.md. Do not silently re-baseline the test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Encounter } from "./types.ts";
import {
  CLASSIFIER_VERSION,
  THRESHOLD_GO_NOW,
  THRESHOLD_PHC_SOON,
  WEIGHTS,
  classifierV1,
  extractFeatures,
} from "./classifier.v1.ts";

function enc(over: Partial<Encounter> = {}): Encounter {
  return {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: [],
    answers: {},
    ...over,
  };
}

/**
 * Scores are floating point sums; compare with a tolerance, not ===.
 * Accepts `undefined` because `noUncheckedIndexedAccess` widens every read of a
 * Record<string, number>, and asserting it here keeps the call sites readable.
 */
function approx(actual: number | undefined, expected: number, eps = 1e-9) {
  assert.ok(typeof actual === "number", `expected a number, got ${String(actual)}`);
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ~${expected}, got ${actual}`,
  );
}

// ------------------------------------------------------------ configuration

test("weights sum to 13.3, the maximum achievable score", () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  approx(total, 13.3, 1e-9);
});

test("thresholds are ordered and deliberately low (over-triage is the safe error)", () => {
  assert.ok(THRESHOLD_PHC_SOON < THRESHOLD_GO_NOW);
  assert.equal(THRESHOLD_PHC_SOON, 2.5);
  assert.equal(THRESHOLD_GO_NOW, 6.0);
});

test("version string is pinned into every result", () => {
  assert.equal(classifierV1.version, CLASSIFIER_VERSION);
  assert.match(CLASSIFIER_VERSION, /^classifier-v/);
});

// ------------------------------------------------------------ features

test("every feature is present and in [0, 1]", () => {
  const f = extractFeatures(enc({ symptoms: ["FEVER", "COUGH"] }));
  for (const key of Object.keys(WEIGHTS)) {
    const v = f[key];
    assert.ok(typeof v === "number", `missing feature ${key}`);
    assert.ok(v >= 0 && v <= 1, `feature ${key} out of range: ${v}`);
  }
});

test("symptomBurden saturates at four symptoms", () => {
  approx(extractFeatures(enc({ symptoms: [] })).symptomBurden, 0);
  approx(extractFeatures(enc({ symptoms: ["FEVER"] })).symptomBurden, 0.25);
  approx(
    extractFeatures(enc({ symptoms: ["FEVER", "COUGH", "RASH", "INJURY"] })).symptomBurden,
    1,
  );
  approx(
    extractFeatures(
      enc({ symptoms: ["FEVER", "COUGH", "RASH", "INJURY", "VOMITING", "DIARRHOEA"] }),
    ).symptomBurden,
    1,
    1e-9,
  );
});

test("duration is banded, with inclusive 24 and 72 hour edges", () => {
  const d = (h: unknown) => extractFeatures(enc({ answers: { DURATION_HOURS: h as number } })).duration;
  approx(d(1), 0);
  approx(d(23), 0);
  approx(d(24), 0.5);
  approx(d(72), 0.5);
  approx(d(73), 1);
  approx(extractFeatures(enc()).duration, 0, 1e-9);
});

test("GUARDRAIL: missing answers contribute 0 and never throw", () => {
  const f = extractFeatures(enc({ symptoms: ["FEVER"] }));
  approx(f.duration, 0);
  approx(f.feverProlonged, 0);
  approx(f.drinkingPoorly, 0);
  approx(f.activityReduced, 0);
  approx(f.chronicIllness, 0);
  approx(f.gettingWorse, 0);
  approx(f.severePain, 0);
});

test("junk answer types degrade to 0 rather than crashing", () => {
  const messy = enc({
    answers: {
      DURATION_HOURS: "not a number",
      FEVER_DAYS: "three",
      PAIN_SCORE: "high",
      CHRONIC_ILLNESS: "yes",
    },
  });
  assert.doesNotThrow(() => extractFeatures(messy));
  const f = extractFeatures(messy);
  approx(f.duration, 0);
  approx(f.feverProlonged, 0);
  approx(f.severePain, 0);
  approx(f.chronicIllness, 0, 1e-9);
});

test("ageExtreme flags the very young and the elderly, not the middle", () => {
  const age = (m: number) =>
    extractFeatures(enc({ patient: { ageMonths: m, sex: "male", pregnancy: "no" } })).ageExtreme;
  approx(age(59), 1);
  approx(age(60), 0);
  approx(age(779), 0);
  approx(age(780), 1);
});

test("mayBePregnant feature reuses the safety convention", () => {
  const f = extractFeatures(
    enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" } }),
  );
  approx(f.mayBePregnant, 1);
});

// ------------------------------------------------------------ calibration

test("CALIBRATION A: healthy adult, one mild symptom -> SELF_CARE", () => {
  const out = classifierV1.classify(enc({ symptoms: ["RASH"] }));
  approx(out.score, 0.375);
  assert.equal(out.tier, "SELF_CARE");
});

test("CALIBRATION B: young child, 2 days of fever -> PHC_SOON", () => {
  const out = classifierV1.classify(
    enc({
      patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
      symptoms: ["FEVER", "COUGH"],
      answers: { DURATION_HOURS: 48, FEVER_DAYS: 3 },
    }),
  );
  approx(out.score, 3.95);
  assert.equal(out.tier, "PHC_SOON");
});

test("CALIBRATION C: elderly, many concerning answers -> GO_NOW", () => {
  const out = classifierV1.classify(
    enc({
      patient: { ageMonths: 840, sex: "male", pregnancy: "no" },
      symptoms: ["FEVER", "COUGH", "VOMITING", "SEVERE_ABDOMINAL_PAIN"],
      answers: {
        DURATION_HOURS: 96,
        FEVER_DAYS: 4,
        DRINKING: "poorly",
        ACTIVITY: "less_active",
        CHRONIC_ILLNESS: true,
        GETTING_WORSE: true,
        PAIN_SCORE: 8,
      },
    }),
  );
  approx(out.score, 12.3, 1e-9);
  assert.equal(out.tier, "GO_NOW");
});

test("threshold boundary is inclusive: exactly 2.5 is PHC_SOON, not SELF_CARE", () => {
  // ageExtreme (1.5) + duration>72h (1.0) = 2.5 exactly.
  const out = classifierV1.classify(
    enc({
      patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
      symptoms: [],
      answers: { DURATION_HOURS: 100 },
    }),
  );
  approx(out.score, 2.5);
  assert.equal(out.tier, "PHC_SOON");
});

// ------------------------------------------------------------ invariants

test("GUARDRAIL: the classifier can never return EMERGENCY", () => {
  const worst = classifierV1.classify(
    enc({
      patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
      symptoms: ["FEVER", "COUGH", "VOMITING", "DIARRHOEA", "SEVERE_ABDOMINAL_PAIN"],
      answers: {
        DURATION_HOURS: 500,
        FEVER_DAYS: 10,
        DRINKING: "poorly",
        ACTIVITY: "less_active",
        CHRONIC_ILLNESS: true,
        GETTING_WORSE: true,
        PAIN_SCORE: 10,
      },
    }),
  );
  assert.notEqual(worst.tier, "EMERGENCY");
  assert.equal(worst.tier, "GO_NOW");
  assert.ok(worst.score <= 13.3);
});

test("deterministic: identical input gives identical output", () => {
  const e = enc({ symptoms: ["FEVER"], answers: { DURATION_HOURS: 30 } });
  assert.deepEqual(classifierV1.classify(e), classifierV1.classify(e));
});

test("monotonic: adding a concerning answer never lowers the score", () => {
  const base = enc({
    patient: { ageMonths: 30, sex: "male", pregnancy: "no" },
    symptoms: ["FEVER"],
    answers: { DURATION_HOURS: 30 },
  });
  let previous = classifierV1.classify(base).score;

  const escalations: Array<Partial<Encounter["answers"]>> = [
    { FEVER_DAYS: 4 },
    { DRINKING: "poorly" },
    { ACTIVITY: "less_active" },
    { GETTING_WORSE: true },
    { CHRONIC_ILLNESS: true },
    { PAIN_SCORE: 9 },
  ];

  let answers = { ...base.answers };
  for (const step of escalations) {
    answers = { ...answers, ...step };
    const next = classifierV1.classify({ ...base, answers }).score;
    assert.ok(next >= previous, `score dropped after adding ${JSON.stringify(step)}`);
    previous = next;
  }
});

test("the feature vector is returned so a future trained model can consume it", () => {
  const out = classifierV1.classify(enc({ symptoms: ["FEVER"] }));
  assert.deepEqual(Object.keys(out.features).sort(), Object.keys(WEIGHTS).sort());
});
