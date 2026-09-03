/**
 * FILE: packages/core/src/triage/redFlags.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.3
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 1
 *
 * These tests run against the REAL ruleset (ruleset.v1.ts), so they double as
 * the ruleset's regression suite. If a rule is edited and a test here breaks,
 * that is the safety net working — do not "fix" the test, justify the rule
 * change in docs/SAFETY.md.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Encounter } from "./types.ts";
import { evaluateRedFlags, mostSevereTier } from "./redFlags.ts";
import { RULES, RULESET_VERSION } from "./ruleset.v1.ts";

function enc(over: Partial<Encounter> = {}): Encounter {
  return {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: [],
    answers: {},
    ...over,
  };
}

const ids = (e: Encounter) => evaluateRedFlags(e, RULES).map((h) => h.ruleId);

// ------------------------------------------------------------ ruleset shape

test("ruleset is versioned and non-empty", () => {
  assert.match(RULESET_VERSION, /^redflags-v\d+\.\d+\.\d+$/);
  assert.ok(RULES.length >= 14);
});

test("every rule has a unique id, a plain label and at least one action", () => {
  const seen = new Set<string>();
  for (const r of RULES) {
    assert.equal(seen.has(r.id), false, `duplicate rule id ${r.id}`);
    seen.add(r.id);
    assert.match(r.id, /^RF_[A-Z0-9_]+$/);
    assert.ok(r.label.length > 0, `${r.id} has no label`);
    assert.ok(r.advice.length > 0, `${r.id} has no advice`);
    assert.ok(
      r.tier === "EMERGENCY" || r.tier === "GO_NOW",
      `${r.id}: a red flag may only be EMERGENCY or GO_NOW`,
    );
  }
});

test("GUARDRAIL: no rule label or advice names a disease", () => {
  // The system is non-diagnostic. Copy describes what to DO, never what it IS.
  const banned = [
    "malaria",
    "dengue",
    "pneumonia",
    "sepsis",
    "eclampsia",
    "stroke",
    "heart attack",
    "infection",
    "diagnosis",
    "tuberculosis",
    "cholera",
  ];
  for (const r of RULES) {
    const text = [r.label, ...r.advice].join(" ").toLowerCase();
    for (const word of banned) {
      assert.equal(text.includes(word), false, `${r.id} mentions "${word}"`);
    }
  }
});

// ------------------------------------------------------------ matching

test("no danger signs produces no hits (an empty result is normal, not an error)", () => {
  assert.deepEqual(ids(enc({ symptoms: ["RASH"] })), []);
});

test("unconsciousness fires the unconscious rule", () => {
  assert.ok(ids(enc({ symptoms: ["UNCONSCIOUS"] })).includes("RF_UNCONSCIOUS"));
});

test("fever in a baby under 2 months is an emergency", () => {
  const baby = enc({
    patient: { ageMonths: 1, sex: "female", pregnancy: "unknown" },
    symptoms: ["FEVER"],
  });
  assert.deepEqual(ids(baby), ["RF_INFANT_FEVER"]);
});

test("the same fever in a 6-month-old does NOT fire the infant rule", () => {
  const older = enc({
    patient: { ageMonths: 6, sex: "female", pregnancy: "no" },
    symptoms: ["FEVER"],
  });
  assert.equal(ids(older).includes("RF_INFANT_FEVER"), false);
});

test("SAFETY: heavy bleeding with UNKNOWN pregnancy still fires the obstetric rule", () => {
  const e = enc({
    patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" },
    symptoms: ["BLEEDING_HEAVY"],
  });
  const hits = ids(e);
  assert.ok(hits.includes("RF_PREG_BLEEDING"));
  assert.ok(hits.includes("RF_HEAVY_BLEEDING_ANY"));
});

test("ALL matching rules are returned, in ruleset order", () => {
  const e = enc({
    patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" },
    symptoms: ["BLEEDING_HEAVY"],
  });
  assert.deepEqual(
    ids(e),
    ["RF_PREG_BLEEDING", "RF_HEAVY_BLEEDING_ANY"],
    "order must follow RULES so output is stable",
  );
});

test("a man with heavy bleeding gets only the general rule", () => {
  assert.deepEqual(ids(enc({ symptoms: ["BLEEDING_HEAVY"] })), ["RF_HEAVY_BLEEDING_ANY"]);
});

test("chest pain fires only at or above 35 years", () => {
  const younger = enc({
    patient: { ageMonths: 419, sex: "male", pregnancy: "no" },
    symptoms: ["CHEST_PAIN"],
  });
  const older = enc({
    patient: { ageMonths: 420, sex: "male", pregnancy: "no" },
    symptoms: ["CHEST_PAIN"],
  });
  assert.equal(ids(younger).includes("RF_CHEST_PAIN_ADULT"), false);
  assert.equal(ids(older).includes("RF_CHEST_PAIN_ADULT"), true);
});

test("unable to drink is driven by the follow-up answer, not a symptom code", () => {
  const e = enc({ symptoms: ["FEVER"], answers: { DRINKING: "unable" } });
  assert.ok(ids(e).includes("RF_UNABLE_TO_DRINK"));

  const poorly = enc({ symptoms: ["FEVER"], answers: { DRINKING: "poorly" } });
  assert.equal(ids(poorly).includes("RF_UNABLE_TO_DRINK"), false);
});

test("bloody diarrhoea in a young child is a GO_NOW flag", () => {
  const e = enc({
    patient: { ageMonths: 30, sex: "male", pregnancy: "no" },
    symptoms: ["DIARRHOEA"],
    answers: { BLOOD_IN_STOOL: true },
  });
  assert.deepEqual(ids(e), ["RF_BLOODY_DIARRHOEA_CHILD"]);
});

test("hits carry the label and advice verbatim from the ruleset", () => {
  const hits = evaluateRedFlags(enc({ symptoms: ["CONVULSION"] }), RULES);
  const hit = hits[0];
  const rule = RULES.find((r) => r.id === "RF_CONVULSION");
  assert.ok(hit);
  assert.ok(rule);
  assert.equal(hit.label, rule.label);
  assert.deepEqual(hit.advice, rule.advice);
});

// ------------------------------------------------------------ severity

test("mostSevereTier returns undefined when nothing matched", () => {
  assert.equal(mostSevereTier([], RULES), undefined);
});

test("mostSevereTier picks EMERGENCY over GO_NOW regardless of hit order", () => {
  const e = enc({
    patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
    symptoms: ["REDUCED_FETAL_MOVEMENT", "CONVULSION"],
  });
  const hits = evaluateRedFlags(e, RULES);
  assert.ok(hits.length >= 2);
  assert.equal(mostSevereTier(hits, RULES), "EMERGENCY");
});

test("mostSevereTier returns GO_NOW when only GO_NOW rules matched", () => {
  const e = enc({
    patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
    symptoms: ["REDUCED_FETAL_MOVEMENT"],
  });
  const hits = evaluateRedFlags(e, RULES);
  assert.deepEqual(
    hits.map((h) => h.ruleId),
    ["RF_REDUCED_FETAL_MOVEMENT"],
  );
  assert.equal(mostSevereTier(hits, RULES), "GO_NOW");
});
