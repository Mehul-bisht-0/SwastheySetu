/**
 * FILE: packages/core/src/facilities/capability.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.6
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 2
 *
 * This is the seam between the decision engine and the routing engine. If it is
 * wrong, a patient is sent to a facility that cannot treat them — the single
 * worst failure this project can produce.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Encounter, TriageResult, UrgencyTier } from "../triage/types.ts";
import { NON_DIAGNOSTIC_DISCLAIMER } from "../triage/types.ts";
import { CAP, MIN_LEVEL_BY_TIER, requiredCapability } from "./capability.ts";

function enc(over: Partial<Encounter> = {}): Encounter {
  return {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: [],
    answers: {},
    ...over,
  };
}

function result(tier: UrgencyTier): TriageResult {
  return {
    tier,
    decisionSource: tier === "EMERGENCY" ? "RED_FLAG" : "CLASSIFIER",
    redFlagHits: [],
    rulesetVersion: "test",
    advice: [],
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    evaluatedAt: "2026-03-10T00:00:00.000Z",
  };
}

// ------------------------------------------------------------ level floors

test("minimum facility level rises with urgency", () => {
  assert.equal(MIN_LEVEL_BY_TIER.SELF_CARE, 1);
  assert.equal(MIN_LEVEL_BY_TIER.PHC_SOON, 1);
  assert.equal(MIN_LEVEL_BY_TIER.GO_NOW, 2);
  assert.equal(MIN_LEVEL_BY_TIER.EMERGENCY, 3);
});

test("an adult emergency needs a level-3 facility with 24-hour emergency care", () => {
  const req = requiredCapability(enc(), result("EMERGENCY"));
  assert.equal(req.minLevel, 3);
  assert.deepEqual(req.requiredTags, [CAP.EMERGENCY_24X7]);
});

test("a mild adult case has no capability demands", () => {
  const req = requiredCapability(enc(), result("SELF_CARE"));
  assert.equal(req.minLevel, 1);
  assert.deepEqual(req.requiredTags, []);
});

// ------------------------------------------------------------ obstetric

test("a pregnant emergency requires delivery AND caesarean capability", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "yes" } });
  const req = requiredCapability(e, result("EMERGENCY"));
  assert.deepEqual(req.requiredTags, [CAP.CAESAREAN, CAP.DELIVERY, CAP.EMERGENCY_24X7]);
  assert.equal(req.minLevel, 3);
});

test("SAFETY: unknown pregnancy in a woman of reproductive age still demands obstetric capability", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" } });
  const req = requiredCapability(e, result("GO_NOW"));
  assert.deepEqual(req.requiredTags, [CAP.CAESAREAN, CAP.DELIVERY]);
  assert.equal(req.minLevel, 2);
});

test("a non-urgent pregnancy needs delivery capability but not surgery", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "yes" } });
  const req = requiredCapability(e, result("PHC_SOON"));
  assert.deepEqual(req.requiredTags, [CAP.DELIVERY]);
});

test("a woman outside reproductive age gets no obstetric requirement", () => {
  const e = enc({ patient: { ageMonths: 720, sex: "female", pregnancy: "unknown" } });
  const req = requiredCapability(e, result("GO_NOW"));
  assert.deepEqual(req.requiredTags, []);
});

// ------------------------------------------------------------ paediatric

test("a child under five requires paediatric capability", () => {
  const e = enc({ patient: { ageMonths: 36, sex: "male", pregnancy: "no" } });
  const req = requiredCapability(e, result("GO_NOW"));
  assert.deepEqual(req.requiredTags, [CAP.PAEDIATRIC]);
  assert.equal(req.minLevel, 2);
});

test("a five-year-old is no longer paediatric-gated", () => {
  const e = enc({ patient: { ageMonths: 60, sex: "male", pregnancy: "no" } });
  const req = requiredCapability(e, result("GO_NOW"));
  assert.deepEqual(req.requiredTags, []);
});

test("a young infant also requires newborn care", () => {
  const e = enc({ patient: { ageMonths: 1, sex: "female", pregnancy: "unknown" } });
  const req = requiredCapability(e, result("GO_NOW"));
  assert.deepEqual(req.requiredTags, [CAP.NEWBORN_CARE, CAP.PAEDIATRIC]);
  assert.equal(req.minLevel, 2);
});

test("a young infant EMERGENCY is floored at level 3", () => {
  const e = enc({ patient: { ageMonths: 1, sex: "female", pregnancy: "unknown" } });
  const req = requiredCapability(e, result("EMERGENCY"));
  assert.equal(req.minLevel, 3);
  assert.deepEqual(req.requiredTags, [
    CAP.EMERGENCY_24X7,
    CAP.NEWBORN_CARE,
    CAP.PAEDIATRIC,
  ]);
});

// ------------------------------------------------------------ determinism

test("tags are sorted so the output is stable across calls", () => {
  const e = enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "yes" } });
  const a = requiredCapability(e, result("EMERGENCY"));
  const b = requiredCapability(e, result("EMERGENCY"));
  assert.deepEqual(a, b);
  assert.deepEqual([...a.requiredTags].sort(), a.requiredTags);
});

test("tags contain no duplicates", () => {
  const e = enc({ patient: { ageMonths: 1, sex: "female", pregnancy: "unknown" } });
  const req = requiredCapability(e, result("EMERGENCY"));
  assert.equal(new Set(req.requiredTags).size, req.requiredTags.length);
});

test("every emitted tag is a known capability code", () => {
  const known = new Set<string>(Object.values(CAP));
  const cases: Array<[Encounter, UrgencyTier]> = [
    [enc(), "EMERGENCY"],
    [enc({ patient: { ageMonths: 1, sex: "female", pregnancy: "unknown" } }), "EMERGENCY"],
    [enc({ patient: { ageMonths: 300, sex: "female", pregnancy: "yes" } }), "GO_NOW"],
    [enc({ patient: { ageMonths: 36, sex: "male", pregnancy: "no" } }), "PHC_SOON"],
  ];
  for (const [e, tier] of cases) {
    for (const tag of requiredCapability(e, result(tier)).requiredTags) {
      assert.ok(known.has(tag), `unknown capability tag "${tag}"`);
    }
  }
});
