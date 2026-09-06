/**
 * Phase 6 integration coverage against the completed facilities contract.
 * These tests use the real seeded routing table when PostgreSQL is available.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { facilities as facilityContracts } from "@swasthyasetu/contracts";
import { body, testApp } from "./helpers.ts";
import { healthCheck, query } from "../src/db/pool.ts";

const dbUp = await healthCheck();
const skipWithoutDb = dbUp ? false : "no database";

async function seededVillageId(): Promise<string> {
  const rows = await query<{ village_id: string }>(
    "SELECT village_id FROM villages WHERE district_code = $1 ORDER BY name LIMIT 1",
    ["227"],
  );
  const row = rows[0];
  assert.ok(row, "seed data missing: run npm run db:seed");
  return row.village_id;
}

test("recommendation response matches the shared contract and maxResults", { skip: skipWithoutDb }, async () => {
  const app = await testApp();
  const response = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: await seededVillageId(),
      maxResults: 2,
      encounter: {
        patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
        symptoms: ["RASH"],
        answers: {},
      },
    },
  });

  assert.equal(response.statusCode, 200);
  const parsed = body<{ ok: boolean; data: unknown }>(response);
  assert.equal(parsed.ok, true);
  const data = facilityContracts.recommendResponse.parse(parsed.data);
  assert.equal(data.results.length, 2);
  assert.ok(data.results.every((item) => item.facility.districtCode === "227"));
  assert.ok(data.results.every((item) => item.facility.isDemoData));
});

test("recommendation uses encounter context for hard capability requirements", { skip: skipWithoutDb }, async () => {
  const app = await testApp();
  const villageId = await seededVillageId();

  const childResponse = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId,
      encounter: {
        patient: { ageMonths: 24, sex: "female", pregnancy: "unknown" },
        symptoms: ["FEVER"],
        answers: {},
      },
    },
  });
  const child = facilityContracts.recommendResponse.parse(
    body<{ data: unknown }>(childResponse).data,
  );
  assert.ok(child.requirement.requiredTags.includes("PAEDIATRIC"));
  assert.equal(child.requirement.requiredTags.includes("DELIVERY"), false);

  const pregnancyResponse = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId,
      encounter: {
        patient: { ageMonths: 300, sex: "female", pregnancy: "unknown" },
        symptoms: ["FEVER"],
        answers: {},
      },
    },
  });
  const pregnancy = facilityContracts.recommendResponse.parse(
    body<{ data: unknown }>(pregnancyResponse).data,
  );
  assert.ok(pregnancy.requirement.requiredTags.includes("DELIVERY"));
});

test("emergency recommendations preserve capability and honesty at the HTTP boundary", { skip: skipWithoutDb }, async () => {
  const app = await testApp();
  const response = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: await seededVillageId(),
      encounter: {
        patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
        symptoms: ["UNCONSCIOUS"],
        answers: {},
      },
    },
  });

  assert.equal(response.statusCode, 200);
  const raw = body<{ data: unknown }>(response).data;
  const data = facilityContracts.recommendResponse.parse(raw);
  assert.equal(data.tier, "EMERGENCY");
  assert.ok(data.results.length > 0);
  assert.ok(data.results.every((item) => item.reasons.length > 0));
  assert.ok(
    data.results[0]?.facility.capabilityTags.includes("EMERGENCY_24X7") || data.fallbackApplied,
  );
  assert.ok(data.results.every((item) => item.travelEstimated));

  const banned = new Set(["isOpen", "open", "available", "isAvailable", "status", "hasBeds"]);
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert.equal(banned.has(key), false, `response contains banned field ${key}`);
        walk(child);
      }
    }
  };
  walk(raw);
});
