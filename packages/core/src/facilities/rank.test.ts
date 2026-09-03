/**
 * FILE: packages/core/src/facilities/rank.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.8
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 2
 *
 * The scores below were computed from DEFAULT_RANKING using the rounding order
 * documented in rank.ts: round each weighted component to 4 decimals, then sum,
 * then round again. If your implementation sums raw and rounds once, the last
 * digits will differ and these tests will fail — that is intentional.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CAP } from "./capability.ts";
import { DEFAULT_RANKING, rankFacilities } from "./rank.ts";
import type { CapabilityRequirement, FacilityCandidate } from "./types.ts";

const NOW = "2026-03-10T00:00:00.000Z";
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

function fac(over: Partial<FacilityCandidate> & { facilityId: string }): FacilityCandidate {
  return {
    name: over.facilityId,
    facilityType: "PHC",
    capabilityLevel: 2,
    capabilityTags: [],
    travelSeconds: 600,
    distanceMeters: 8000,
    travelSource: "OSRM",
    lastConfirmedAt: null,
    lastNegativeAt: null,
    latitude: 25.0,
    longitude: 85.0,
    phone: null,
    ...over,
  };
}

/** District hospital: far away, well equipped, confirmed 2 days ago. */
const A = fac({
  facilityId: "fac-a",
  name: "District Hospital",
  facilityType: "DH",
  capabilityLevel: 4,
  capabilityTags: [CAP.EMERGENCY_24X7, CAP.DELIVERY, CAP.CAESAREAN, CAP.INPATIENT],
  travelSeconds: 3600,
  distanceMeters: 45000,
  lastConfirmedAt: daysAgo(2),
});

/** CHC: much closer, decent level, but nobody has confirmed it in a month. */
const B = fac({
  facilityId: "fac-b",
  name: "Community Health Centre",
  facilityType: "CHC",
  capabilityLevel: 3,
  capabilityTags: [CAP.EMERGENCY_24X7, CAP.DELIVERY, CAP.INPATIENT],
  travelSeconds: 1200,
  distanceMeters: 14000,
  lastConfirmedAt: daysAgo(30),
});

/** PHC: near, freshly confirmed, limited capability. */
const C = fac({
  facilityId: "fac-c",
  name: "Primary Health Centre",
  capabilityLevel: 2,
  capabilityTags: [CAP.DELIVERY, CAP.PHARMACY],
  travelSeconds: 600,
  lastConfirmedAt: daysAgo(1),
});

/** Sub-centre: nearest, confirmed today, almost no capability. */
const D = fac({
  facilityId: "fac-d",
  name: "Sub-Centre",
  facilityType: "SC",
  capabilityLevel: 1,
  capabilityTags: [],
  travelSeconds: 300,
  distanceMeters: 3500,
  lastConfirmedAt: NOW,
});

const ALL = [A, B, C, D];
const EMERGENCY_REQ: CapabilityRequirement = {
  minLevel: 3,
  requiredTags: [CAP.EMERGENCY_24X7],
};
const ids = (o: ReturnType<typeof rankFacilities>) => o.results.map((r) => r.facility.facilityId);

/** `noUncheckedIndexedAccess` is on, so pull positions out through an assertion. */
function at(o: ReturnType<typeof rankFacilities>, i: number) {
  const r = o.results[i];
  assert.ok(r, `expected a result at position ${i}`);
  return r;
}

// ------------------------------------------------------------ hard filter

test("capability is a hard gate — under-equipped facilities are excluded entirely", () => {
  const out = rankFacilities(ALL, EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.deepEqual(ids(out).sort(), ["fac-a", "fac-b"]);
  assert.equal(out.fallbackApplied, false);
  assert.deepEqual(out.unmetRequirements, []);
});

test("THE HEADLINE CASE: for an emergency, the right hospital beats the near one", () => {
  const out = rankFacilities(ALL, EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.deepEqual(ids(out), ["fac-a", "fac-b"]);
  assert.equal(at(out, 0).score, 0.7384);
  assert.equal(at(out, 1).score, 0.5617);
  assert.deepEqual(at(out, 0).breakdown, {
    capability: 0.44,
    time: 0.125,
    freshness: 0.1734,
  });
});

test("for a non-urgent case, the near freshly-confirmed PHC wins instead", () => {
  const out = rankFacilities(ALL, { minLevel: 1, requiredTags: [] }, "PHC_SOON", NOW);
  assert.deepEqual(ids(out), ["fac-c", "fac-d", "fac-a", "fac-b"]);
  assert.equal(at(out, 0).score, 0.7793);
  assert.equal(at(out, 1).score, 0.775);
});

test("ranks are 1-based and contiguous", () => {
  const out = rankFacilities(ALL, { minLevel: 1, requiredTags: [] }, "PHC_SOON", NOW);
  assert.deepEqual(
    out.results.map((r) => r.rank),
    [1, 2, 3, 4],
  );
});

test("results are capped at maxResults", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    fac({ facilityId: `f-${i}`, travelSeconds: 300 + i * 60, lastConfirmedAt: NOW }),
  );
  const out = rankFacilities(many, { minLevel: 1, requiredTags: [] }, "PHC_SOON", NOW);
  assert.equal(out.results.length, DEFAULT_RANKING.maxResults);
});

// ------------------------------------------------------------ freshness effect

test("a facility reported closed is pushed down but not hidden", () => {
  const closed = { ...B, lastConfirmedAt: daysAgo(1), lastNegativeAt: NOW };
  const out = rankFacilities([A, closed], EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.equal(ids(out)[0], "fac-a");
  assert.equal(out.results.length, 2, "still listed — the citizen may have no alternative");
  const b = out.results.find((r) => r.facility.facilityId === "fac-b");
  assert.ok(b);
  assert.equal(b.freshness.band, "REPORTED_CLOSED");
});

test("between two identical facilities, the fresher evidence wins", () => {
  const stale = fac({
    facilityId: "fac-stale",
    capabilityLevel: 3,
    capabilityTags: [CAP.EMERGENCY_24X7],
    lastConfirmedAt: daysAgo(45),
  });
  const fresh = fac({
    facilityId: "fac-fresh",
    capabilityLevel: 3,
    capabilityTags: [CAP.EMERGENCY_24X7],
    lastConfirmedAt: NOW,
  });
  const out = rankFacilities([stale, fresh], EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.deepEqual(ids(out), ["fac-fresh", "fac-stale"]);
});

// ------------------------------------------------------------ fallback ladder

test("when nothing qualifies, requirements are relaxed and the relaxation is reported", () => {
  const req: CapabilityRequirement = { minLevel: 4, requiredTags: [CAP.NEWBORN_CARE] };
  const out = rankFacilities(ALL, req, "GO_NOW", NOW);
  assert.equal(out.fallbackApplied, true);
  assert.deepEqual(out.unmetRequirements, [CAP.NEWBORN_CARE]);
  assert.deepEqual(ids(out), ["fac-a"]);
  assert.deepEqual(out.requirement.requiredTags, [], "the RELAXED requirement is returned");
});

test("convenience tags are dropped before clinical ones", () => {
  const req: CapabilityRequirement = {
    minLevel: 2,
    requiredTags: [CAP.PHARMACY, CAP.CAESAREAN],
  };
  const out = rankFacilities([A], req, "GO_NOW", NOW);
  assert.equal(out.fallbackApplied, true);
  assert.deepEqual(out.unmetRequirements, [CAP.PHARMACY]);
  assert.deepEqual(ids(out), ["fac-a"], "caesarean was kept, pharmacy was given up");
});

test("an EMERGENCY is never relaxed below level 2", () => {
  const req: CapabilityRequirement = { minLevel: 5, requiredTags: [CAP.CAESAREAN] };
  const out = rankFacilities([D], req, "EMERGENCY", NOW);
  assert.equal(out.fallbackApplied, true);
  assert.deepEqual(out.results, [], "a level-1 sub-centre is never an emergency answer");
  assert.ok(out.requirement.minLevel >= DEFAULT_RANKING.minEmergencyLevel);
});

test("returning nothing is a valid, honest answer", () => {
  const out = rankFacilities([], EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.deepEqual(out.results, []);
});

// ------------------------------------------------------------ determinism

test("ties break deterministically: freshness, then travel time, then id", () => {
  const base = {
    capabilityLevel: 3 as const,
    capabilityTags: [CAP.EMERGENCY_24X7],
    lastConfirmedAt: NOW,
    travelSeconds: 900,
  };
  const x = fac({ facilityId: "fac-x", ...base });
  const y = fac({ facilityId: "fac-y", ...base });
  const out = rankFacilities([y, x], EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.deepEqual(ids(out), ["fac-x", "fac-y"]);
});

test("input order does not change the result", () => {
  const forward = rankFacilities(ALL, { minLevel: 1, requiredTags: [] }, "GO_NOW", NOW);
  const reversed = rankFacilities([...ALL].reverse(), { minLevel: 1, requiredTags: [] }, "GO_NOW", NOW);
  assert.deepEqual(ids(forward), ids(reversed));
});

test("ranking does not mutate its inputs", () => {
  const before = JSON.stringify(ALL);
  rankFacilities(ALL, EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.equal(JSON.stringify(ALL), before);
});

// ------------------------------------------------------------ explanations

test("every result explains itself in plain language", () => {
  const out = rankFacilities(ALL, EMERGENCY_REQ, "EMERGENCY", NOW);
  for (const r of out.results) {
    assert.ok(r.reasons.length > 0, `${r.facility.facilityId} has no reasons`);
    assert.ok(
      r.reasons.some((x) => /minutes away/i.test(x)),
      "travel time must always be stated",
    );
    assert.ok(
      r.reasons.includes(r.freshness.copy),
      "the freshness sentence must appear verbatim",
    );
  }
});

test("an estimated travel time is labelled as an estimate, never as a road route", () => {
  const guessed = { ...A, travelSource: "ESTIMATED" as const };
  const out = rankFacilities([guessed], EMERGENCY_REQ, "EMERGENCY", NOW);
  assert.equal(at(out, 0).travelEstimated, true);
  assert.ok(at(out, 0).reasons.some((x) => /estimated/i.test(x)));
});

test("missing capability is stated plainly, not hidden", () => {
  const req: CapabilityRequirement = { minLevel: 2, requiredTags: [CAP.CAESAREAN] };
  const out = rankFacilities([C], req, "GO_NOW", NOW);
  assert.equal(out.fallbackApplied, true);
  assert.ok(
    at(out, 0).reasons.some((x) => /does not have/i.test(x)),
    "the citizen must be told what this facility cannot do",
  );
});

test("GUARDRAIL 3: no reason line claims a facility is open", () => {
  const out = rankFacilities(ALL, { minLevel: 1, requiredTags: [] }, "PHC_SOON", NOW);
  for (const r of out.results) {
    for (const line of r.reasons) {
      const l = line.toLowerCase();
      assert.equal(l.includes("is open"), false, `claims availability: "${line}"`);
      assert.equal(l.includes("available now"), false, `claims availability: "${line}"`);
    }
  }
});
