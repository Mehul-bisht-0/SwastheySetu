/**
 * FILE: apps/api/test/asha-phase8.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.9, Phase 8
 * STATUS: COMPLETE — authenticated ASHA workflow coverage.
 */
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { asha as ashaContracts } from "@swasthyasetu/contracts";

import { healthCheck, query } from "../src/db/pool.ts";
import { authHeader, body, loginAs, testApp } from "./helpers.ts";

const ASHA_ONE = { phone: "+917001000001", password: "Asha@demo1!" };
const ASHA_TWO = { phone: "+917001000002", password: "Asha@demo2!" };

let dbUp = false;
let tokenOne = "";
let tokenTwo = "";
const createdVisitIds = new Set<string>();

before(async () => {
  dbUp = await healthCheck();
  if (!dbUp) return;
  const app = await testApp();
  tokenOne = await loginAs(app, ASHA_ONE.phone, ASHA_ONE.password);
  tokenTwo = await loginAs(app, ASHA_TWO.phone, ASHA_TWO.password);
});

afterEach(async () => {
  if (!dbUp || createdVisitIds.size === 0) return;
  await query("DELETE FROM household_visits WHERE visit_id = ANY($1::uuid[])", [
    [...createdVisitIds],
  ]);
  createdVisitIds.clear();
});

async function firstVillage(token: string): Promise<string> {
  const app = await testApp();
  const response = await app.inject({
    method: "GET",
    url: "/asha/villages",
    headers: authHeader(token),
  });
  assert.equal(response.statusCode, 200);
  const parsed = body<{ data: unknown }>(response);
  const villages = ashaContracts.villagesResponse.parse(parsed.data);
  const first = villages.items[0];
  assert.ok(first, "seed data missing: run npm run db:seed");
  return first.villageId;
}

function visit(villageId: string, version = 1) {
  const now = new Date().toISOString();
  const visitId = randomUUID();
  createdVisitIds.add(visitId);
  return {
    visitId,
    villageId,
    householdCode: "HH-014",
    visitedAt: now,
    membersSeen: 3,
    dangerSigns: ["FEVER"] as const,
    referralMade: false,
    findings: { temperatureReported: true },
    notes: "Follow-up requested",
    entityVersion: version,
    createdAt: now,
  };
}

test("ASHA routes require authentication", async () => {
  const app = await testApp();
  const response = await app.inject({ method: "GET", url: "/asha/villages" });
  assert.equal(response.statusCode, 401);
});

test("assigned villages come from the authenticated district", async (t) => {
  if (!dbUp) return t.skip("no database");
  const app = await testApp();
  const response = await app.inject({
    method: "GET",
    url: "/asha/villages",
    headers: authHeader(tokenOne),
  });
  assert.equal(response.statusCode, 200);
  const parsed = body<{ data: unknown }>(response);
  const villages = ashaContracts.villagesResponse.parse(parsed.data);
  assert.ok(villages.items.length > 0);
  assert.ok(villages.items.every((item) => item.districtCode === "227"));
});

test("visit upsert creates, updates, and rejects a stale version", async (t) => {
  if (!dbUp) return t.skip("no database");
  const app = await testApp();
  const input = visit(await firstVillage(tokenOne));

  const created = await app.inject({
    method: "POST",
    url: "/asha/visits",
    headers: authHeader(tokenOne),
    payload: input,
  });
  assert.equal(created.statusCode, 201);
  const createdData = ashaContracts.upsertVisitResponse.parse(
    body<{ data: unknown }>(created).data,
  );
  assert.equal(createdData.created, true);
  assert.equal(createdData.entityVersion, 1);

  const stale = await app.inject({
    method: "POST",
    url: "/asha/visits",
    headers: authHeader(tokenOne),
    payload: input,
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(body<{ error: { code: string } }>(stale).error.code, "VERSION_CONFLICT");

  const updated = await app.inject({
    method: "POST",
    url: "/asha/visits",
    headers: authHeader(tokenOne),
    payload: { ...input, entityVersion: 2, membersSeen: 4 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(
    ashaContracts.upsertVisitResponse.parse(body<{ data: unknown }>(updated).data).entityVersion,
    2,
  );
});

test("visit listing is scoped to the authenticated ASHA", async (t) => {
  if (!dbUp) return t.skip("no database");
  const app = await testApp();
  const villageId = await firstVillage(tokenOne);
  const first = visit(villageId);
  const second = { ...visit(villageId), householdCode: "HH-099" };

  for (const [token, input] of [[tokenOne, first], [tokenTwo, second]] as const) {
    const response = await app.inject({
      method: "POST",
      url: "/asha/visits",
      headers: authHeader(token),
      payload: input,
    });
    assert.equal(response.statusCode, 201);
  }

  const response = await app.inject({
    method: "GET",
    url: "/asha/visits",
    headers: authHeader(tokenOne),
  });
  assert.equal(response.statusCode, 200);
  const result = ashaContracts.listVisitsResponse.parse(body<{ data: unknown }>(response).data);
  assert.deepEqual(result.items.map((item) => item.visitId), [first.visitId]);
});
