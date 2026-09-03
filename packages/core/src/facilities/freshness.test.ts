/**
 * FILE: packages/core/src/facilities/freshness.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.7
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 2
 *
 * The confidence numbers below are exp(-ageDays / 14) rounded to 3 decimals.
 * They are pinned so that a change to the decay curve is a visible, deliberate
 * act rather than a silent drift in how much the app trusts old evidence.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_FRESHNESS, agePhrase, assessFreshness, decayConfidence } from "./freshness.ts";

const NOW = "2026-03-10T12:00:00.000Z";

/** ISO timestamp for exactly `days` before NOW. */
function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

// ------------------------------------------------------------ decay curve

test("decay is 1 at age 0 and falls exponentially", () => {
  assert.equal(decayConfidence(0), 1);
  assert.ok(decayConfidence(7) < decayConfidence(3));
  assert.ok(decayConfidence(90) < 0.01, "a 3-month-old report is worth almost nothing");
});

test("decay never goes negative for a future timestamp", () => {
  assert.equal(decayConfidence(-5), 1);
});

// ------------------------------------------------------------ bands

test("confirmed today is FRESH with full confidence", () => {
  const a = assessFreshness(NOW, null, NOW);
  assert.equal(a.band, "FRESH");
  assert.equal(a.confidence, 1);
  assert.equal(a.ageDays, 0);
});

test("confirmed 2 days ago is still FRESH", () => {
  const a = assessFreshness(daysAgo(2), null, NOW);
  assert.equal(a.band, "FRESH");
  assert.equal(a.confidence, 0.867);
  assert.equal(a.ageDays, 2);
});

test("band boundaries: 3 days FRESH, 4 days AGING, 14 days AGING, 15 days STALE", () => {
  assert.equal(assessFreshness(daysAgo(3), null, NOW).band, "FRESH");
  assert.equal(assessFreshness(daysAgo(4), null, NOW).band, "AGING");
  assert.equal(assessFreshness(daysAgo(14), null, NOW).band, "AGING");
  assert.equal(assessFreshness(daysAgo(15), null, NOW).band, "STALE");
});

test("confidence is pinned at the reference ages", () => {
  assert.equal(assessFreshness(daysAgo(1), null, NOW).confidence, 0.931);
  assert.equal(assessFreshness(daysAgo(7), null, NOW).confidence, 0.607);
  assert.equal(assessFreshness(daysAgo(14), null, NOW).confidence, 0.368);
  assert.equal(assessFreshness(daysAgo(30), null, NOW).confidence, 0.117);
});

test("never confirmed is UNKNOWN with low but non-zero confidence", () => {
  const a = assessFreshness(null, null, NOW);
  assert.equal(a.band, "UNKNOWN");
  assert.equal(a.ageDays, null);
  assert.equal(a.confidence, 0.1);
  assert.ok(
    a.confidence > 0,
    "an unverified hospital must still be able to outrank a verified sub-centre",
  );
});

// ------------------------------------------------------------ negative evidence

test("a recent negative report overrides an older confirmation", () => {
  const a = assessFreshness(daysAgo(2), daysAgo(1), NOW);
  assert.equal(a.band, "REPORTED_CLOSED");
  assert.equal(a.confidence, 0.217, "decay(2) * 0.25");
});

test("a negative report with no confirmation at all is still REPORTED_CLOSED", () => {
  const a = assessFreshness(null, daysAgo(2), NOW);
  assert.equal(a.band, "REPORTED_CLOSED");
  assert.equal(a.ageDays, null);
});

test("a confirmation NEWER than the negative report wins", () => {
  const a = assessFreshness(daysAgo(1), daysAgo(3), NOW);
  assert.equal(a.band, "FRESH");
  assert.equal(a.confidence, 0.931);
});

test("a negative report older than the window is ignored", () => {
  const a = assessFreshness(daysAgo(20), daysAgo(10), NOW);
  assert.equal(a.band, "STALE", "10 days > negativeWindowDays of 7");
});

// ------------------------------------------------------------ robustness

test("clock skew (a future timestamp) clamps to age 0 rather than going negative", () => {
  const future = new Date(Date.parse(NOW) + 86_400_000).toISOString();
  const a = assessFreshness(future, null, NOW);
  assert.equal(a.ageDays, 0);
  assert.equal(a.band, "FRESH");
});

test("unparseable timestamps degrade to UNKNOWN instead of throwing", () => {
  assert.doesNotThrow(() => assessFreshness("not-a-date", null, NOW));
  assert.equal(assessFreshness("not-a-date", null, NOW).band, "UNKNOWN");
});

test("config is injectable — a shorter tau decays trust faster", () => {
  const impatient = { ...DEFAULT_FRESHNESS, tauDays: 3 };
  const a = assessFreshness(daysAgo(7), null, NOW, impatient);
  const b = assessFreshness(daysAgo(7), null, NOW);
  assert.ok(a.confidence < b.confidence);
});

// ------------------------------------------------------------ THE GUARDRAIL

test("GUARDRAIL 3: copy never claims a facility is open or available", () => {
  const banned = ["is open", "open now", "available", "currently running", "operational"];
  const samples = [
    assessFreshness(NOW, null, NOW),
    assessFreshness(daysAgo(5), null, NOW),
    assessFreshness(daysAgo(40), null, NOW),
    assessFreshness(null, null, NOW),
    assessFreshness(daysAgo(2), daysAgo(1), NOW),
  ];
  for (const s of samples) {
    const copy = s.copy.toLowerCase();
    assert.ok(copy.length > 0, "every assessment must produce readable copy");
    for (const phrase of banned) {
      assert.equal(copy.includes(phrase), false, `copy claims availability: "${s.copy}"`);
    }
  }
});

test("copy states what was reported and how long ago", () => {
  assert.match(assessFreshness(NOW, null, NOW).copy, /today/i);
  assert.match(assessFreshness(daysAgo(1), null, NOW).copy, /yesterday/i);
  assert.match(assessFreshness(daysAgo(4), null, NOW).copy, /4 days ago/i);
  assert.match(assessFreshness(null, null, NOW).copy, /no one has reported/i);
  assert.match(assessFreshness(daysAgo(2), daysAgo(1), NOW).copy, /not working/i);
});

test("agePhrase gets vaguer as evidence gets older, on purpose", () => {
  assert.equal(agePhrase(0), "today");
  assert.equal(agePhrase(1), "yesterday");
  assert.equal(agePhrase(4), "4 days ago");
  assert.equal(agePhrase(10), "last week");
  assert.equal(agePhrase(21), "3 weeks ago");
  assert.equal(agePhrase(95), "3 months ago");
});
