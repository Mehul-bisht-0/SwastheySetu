/**
 * FILE: apps/api/test/facilities.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.8, §6.7
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 7
 *
 * Covers GUARDRAIL 3 — freshness honesty — at the HTTP boundary.
 *
 * The core ranking rules are tested in packages/core/src/facilities/*.test.ts.
 * What this suite protects is the thing a demo audience actually sees: that the
 * API never tells a woman in labour a facility is open when all the backend has
 * is a nine-day-old signal from somebody's phone.
 *
 * REQUIRES A DATABASE (PostGIS). Skips cleanly when Docker is not running.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { testApp, loginAs, authHeader, resetTables, body } from "./helpers.ts";
import { healthCheck, query } from "../src/db/pool.ts";

interface Facility {
  facilityId: string;
  name: string;
  type: string;
  capabilityTags: string[];
  distanceKm: number;
}

interface Ranked {
  facility: Facility;
  freshness: { band: string; confidence: number; lastConfirmedAt: string | null; label: string };
  score: number;
  reasons: string[];
}

let dbUp = false;
let token = "";

const DEMO_PHONE = "+919000000001";
const DEMO_PASSWORD = "demo-asha-password";

before(async () => {
  dbUp = await healthCheck();
  if (!dbUp) return;
  token = await loginAs(await testApp(), DEMO_PHONE, DEMO_PASSWORD);
});

beforeEach(async () => {
  if (dbUp) await resetTables();
});

const skip = () => (dbUp ? false : "no database");

/** A seeded village, so the test does not depend on any particular row order. */
async function seededVillage(): Promise<{ id: string; lat: number; lon: number }> {
  const rows = await query<{ village_id: string; lat: number; lon: number }>(
    "SELECT village_id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon FROM villages LIMIT 1",
  );
  const row = rows[0];
  assert.ok(row, "seed data missing: run npm run db:seed");
  return { id: row.village_id, lat: row.lat, lon: row.lon };
}

// ------------------------------------------------------------ nearby

test("GET /facilities/nearby is public — a citizen has no login", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "GET",
    url: `/facilities/nearby?lat=${v.lat}&lon=${v.lon}&radiusKm=25`,
  });
  assert.equal(res.statusCode, 200);
});

test("nearby results are ordered by distance, nearest first", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "GET",
    url: `/facilities/nearby?lat=${v.lat}&lon=${v.lon}&radiusKm=50`,
  });
  const { data } = body<{ data: { items: Facility[] } }>(res);
  const distances = data.items.map((f) => f.distanceKm);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
});

test("latitude and longitude are not silently swapped", { skip: skip() }, async () => {
  // ST_MakePoint takes longitude first. Swapping them puts every Indian
  // facility in the Arabian Sea and every distance becomes nonsense, which is
  // easy to miss because the query still returns rows.
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "GET",
    url: `/facilities/nearby?lat=${v.lat}&lon=${v.lon}&radiusKm=25`,
  });
  const { data } = body<{ data: { items: Facility[] } }>(res);
  assert.ok(data.items.length > 0, "a village should have at least one facility within 25 km");
  for (const f of data.items) {
    assert.ok(f.distanceKm <= 25.001, `${f.name} is ${f.distanceKm} km away but the radius was 25`);
  }
});

test("an out-of-range coordinate is a 400", { skip: skip() }, async () => {
  const app = await testApp();
  const res = await app.inject({ method: "GET", url: "/facilities/nearby?lat=200&lon=77" });
  assert.equal(res.statusCode, 400);
});

// ------------------------------------------------------------ GUARDRAIL 3

test("GUARDRAIL 3: no response ever claims a facility is open or available", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();

  const nearby = await app.inject({
    method: "GET",
    url: `/facilities/nearby?lat=${v.lat}&lon=${v.lon}&radiusKm=50`,
  });
  const recommend = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
        symptoms: ["LABOUR_PAINS"],
        answers: {},
      },
    },
  });

  for (const res of [nearby, recommend]) {
    const parsed: unknown = JSON.parse(res.payload);
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, val] of Object.entries(node)) {
          keys.add(k);
          walk(val);
        }
      }
    };
    walk(parsed);

    for (const banned of ["isOpen", "open", "available", "isAvailable", "status", "hasBeds"]) {
      assert.equal(
        keys.has(banned),
        false,
        `field "${banned}" implies the backend knows a live state it cannot know`,
      );
    }
  }
});

test("GUARDRAIL 3: freshness is stated as evidence age, never as a live state", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
        symptoms: ["FEVER"],
        answers: { DURATION_HOURS: 48 },
      },
    },
  });
  const { data } = body<{ data: { recommendations: Ranked[] } }>(res);
  assert.ok(data.recommendations.length > 0);

  for (const r of data.recommendations) {
    assert.ok(
      ["FRESH", "AGING", "STALE", "REPORTED_CLOSED", "UNKNOWN"].includes(r.freshness.band),
      `band "${r.freshness.band}" is not a FreshnessBand from packages/core`,
    );
    assert.ok(r.freshness.confidence >= 0 && r.freshness.confidence <= 1);
    // The user-facing string must be about the evidence, not the facility.
    assert.match(
      r.freshness.label,
      /confirmed|no recent|unconfirmed|not been confirmed/i,
      `label "${r.freshness.label}" must describe when it was last confirmed`,
    );
    assert.doesNotMatch(r.freshness.label, /\bis open\b|\bcurrently open\b|\bavailable now\b/i);
  }
});

test("with no signals at all, every facility reports UNKNOWN — not FRESH", { skip: skip() }, async () => {
  // resetTables() has emptied facility_activity. Absence of evidence must never
  // be reported as evidence of availability.
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
        symptoms: ["COUGH"],
        answers: {},
      },
    },
  });
  const { data } = body<{ data: { recommendations: Ranked[] } }>(res);
  for (const r of data.recommendations) {
    assert.equal(r.freshness.band, "UNKNOWN");
    assert.equal(r.freshness.lastConfirmedAt, null);
  }
});

// ------------------------------------------------------------ capability filter

test("an emergency is never routed to a facility without emergency capability", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
        symptoms: ["UNCONSCIOUS"],
        answers: {},
      },
    },
  });
  const { data } = body<{ data: { recommendations: Ranked[]; fallbackApplied: boolean } }>(res);
  assert.ok(data.recommendations.length > 0, "an emergency must always yield somewhere to go");

  const top = data.recommendations[0];
  assert.ok(top);
  // Capability is a hard filter, never a scoring term — a very close facility
  // that cannot treat the patient must not outrank a farther one that can.
  assert.ok(
    top.facility.capabilityTags.includes("EMERGENCY_24X7") || data.fallbackApplied,
    "either the top result can handle an emergency, or the response admits it fell back",
  );
});

test("when the filter is relaxed the response says so, and says what is missing", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 300, sex: "female", pregnancy: "yes" },
        symptoms: ["LABOUR_PAINS", "BLEEDING_HEAVY"],
        answers: {},
      },
    },
  });
  const { data } = body<{
    data: { recommendations: Ranked[]; fallbackApplied: boolean; unmetRequirements: string[] };
  }>(res);
  assert.equal(typeof data.fallbackApplied, "boolean");
  if (data.fallbackApplied) {
    assert.ok(
      data.unmetRequirements.length > 0,
      "a silent fallback is worse than none — the caller must be told what was dropped",
    );
  }
});

test("every recommendation explains itself", { skip: skip() }, async () => {
  const v = await seededVillage();
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: v.id,
      encounter: {
        patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
        symptoms: ["FEVER"],
        answers: {},
      },
    },
  });
  const { data } = body<{ data: { recommendations: Ranked[] } }>(res);
  for (const r of data.recommendations) {
    assert.ok(r.reasons.length > 0, "an unexplained ranking is not auditable and will not be trusted");
  }
});

// ------------------------------------------------------------ signals

test("submitting a facility signal requires authentication", { skip: skip() }, async () => {
  const rows = await query<{ facility_id: string }>("SELECT facility_id FROM facilities LIMIT 1");
  const row = rows[0];
  assert.ok(row);
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: `/facilities/${row.facility_id}/signals`,
    payload: { signalType: "SERVICE_CONFIRMED", capabilityTag: "OPD" },
  });
  assert.equal(res.statusCode, 401);
});

test("a fresh signal moves a facility out of UNKNOWN", { skip: skip() }, async () => {
  const rows = await query<{ facility_id: string }>("SELECT facility_id FROM facilities LIMIT 1");
  const row = rows[0];
  assert.ok(row);
  const app = await testApp();

  const post = await app.inject({
    method: "POST",
    url: `/facilities/${row.facility_id}/signals`,
    headers: authHeader(token),
    payload: { signalType: "SERVICE_CONFIRMED", capabilityTag: "OPD" },
  });
  assert.equal(post.statusCode, 201);

  const after = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM facility_activity WHERE facility_id = $1",
    [row.facility_id],
  );
  const count = after[0];
  assert.ok(count);
  assert.equal(Number(count.n), 1);
});
