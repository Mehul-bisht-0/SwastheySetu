/**
 * FILE: apps/api/test/triage.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.6
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 3
 *
 * NEEDS NO DATABASE. POST /triage/evaluate is a pure function behind HTTP, so
 * this suite runs anywhere and is the fastest signal that app.ts is wired up
 * correctly.
 *
 * These tests assert the API-level SAFETY GUARANTEES, not the rules themselves —
 * the rules are covered by packages/core/src/triage/*.test.ts. What matters here
 * is that the HTTP layer does not weaken them on the way out.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { testApp, body } from "./helpers.ts";

interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

interface Result {
  tier: string;
  decisionSource: string;
  redFlagHits: Array<{ ruleId: string; label: string; advice: string[] }>;
  classifier?: { score: number; features: Record<string, number>; version: string };
  rulesetVersion: string;
  advice: string[];
  disclaimer: string;
  evaluatedAt: string;
}

async function evaluate(payload: unknown) {
  const app = await testApp();
  return app.inject({ method: "POST", url: "/triage/evaluate", payload });
}

const adult = { ageMonths: 360, sex: "male", pregnancy: "no" };

// ------------------------------------------------------------ wiring

test("the endpoint is public — no Authorization header required", async () => {
  const res = await evaluate({
    encounter: { patient: adult, symptoms: ["RASH"], answers: {} },
  });
  assert.equal(res.statusCode, 200);
});

test("responses use the ok/data envelope", async () => {
  const res = await evaluate({
    encounter: { patient: adult, symptoms: ["RASH"], answers: {} },
  });
  const parsed = body<Envelope<{ result: Result }>>(res);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.data.result);
});

test("a malformed body is a 400 with field-level detail, not a 500", async () => {
  const res = await evaluate({ encounter: { patient: { ageMonths: -5 } } });
  assert.equal(res.statusCode, 400);
  const parsed = body<{ ok: boolean; error: { code: string; fields?: unknown } }>(res);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "VALIDATION_FAILED");
});

test("an unknown symptom code is rejected rather than silently ignored", async () => {
  const res = await evaluate({
    encounter: { patient: adult, symptoms: ["NOT_A_REAL_SYMPTOM"], answers: {} },
  });
  assert.equal(res.statusCode, 400);
});

// ------------------------------------------------------------ safety guarantees

test("GUARDRAIL: every result carries the non-diagnostic disclaimer", async () => {
  const res = await evaluate({
    encounter: { patient: adult, symptoms: ["FEVER"], answers: {} },
  });
  const { result } = body<Envelope<{ result: Result }>>(res).data;
  assert.ok(result.disclaimer.length > 0);
  assert.match(result.disclaimer, /not a diagnosis/i);
});

test("GUARDRAIL: a red-flag result never includes a classifier score", async () => {
  // The classifier must not run once a red flag has fired (core GUARDRAIL 8).
  // If a score appears here, the API is calling the classifier separately.
  const res = await evaluate({
    encounter: { patient: adult, symptoms: ["UNCONSCIOUS"], answers: {} },
  });
  const { result } = body<Envelope<{ result: Result }>>(res).data;
  assert.equal(result.tier, "EMERGENCY");
  assert.equal(result.decisionSource, "RED_FLAG");
  assert.equal(result.classifier, undefined);
});

test("GUARDRAIL: the response names no disease", async () => {
  const res = await evaluate({
    encounter: {
      patient: { ageMonths: 24, sex: "female", pregnancy: "no" },
      symptoms: ["FEVER", "FAST_BREATHING"],
      answers: { DURATION_HOURS: 48 },
    },
  });
  const text = res.payload.toLowerCase();
  for (const word of ["pneumonia", "malaria", "dengue", "sepsis", "diagnosis of"]) {
    assert.equal(text.includes(word), false, `response mentions "${word}"`);
  }
});

test("SAFETY: unknown pregnancy in a woman of childbearing age is treated as possible", async () => {
  const res = await evaluate({
    encounter: {
      patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" },
      symptoms: ["BLEEDING_HEAVY"],
      answers: {},
    },
  });
  const { result } = body<Envelope<{ result: Result }>>(res).data;
  assert.equal(result.tier, "EMERGENCY");
  assert.ok(
    result.redFlagHits.some((h) => h.ruleId === "RF_PREG_BLEEDING"),
    "the obstetric rule must fire when pregnancy is unknown",
  );
});

test("the ruleset version is stamped on every result", async () => {
  const res = await evaluate({
    encounter: { patient: adult, symptoms: [], answers: {} },
  });
  const { result } = body<Envelope<{ result: Result }>>(res).data;
  assert.match(result.rulesetVersion, /^redflags-v\d+\.\d+\.\d+$/);
});

test("the endpoint is stateless: the same request twice gives the same tier", async () => {
  const payload = {
    encounter: {
      patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
      symptoms: ["FEVER", "COUGH"],
      answers: { DURATION_HOURS: 48, FEVER_DAYS: 3 },
    },
  };
  const a = body<Envelope<{ result: Result }>>(await evaluate(payload));
  const b = body<Envelope<{ result: Result }>>(await evaluate(payload));
  assert.equal(a.data.result.tier, b.data.result.tier);
  assert.deepEqual(a.data.result.advice, b.data.result.advice);
});
