/**
 * FILE: apps/api/test/sync.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.2, §10.3
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 9
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE MOST IMPORTANT TEST IN THE API.
 *
 *  If this passes, an ASHA's day of offline work survives a dropped connection.
 *  If it does not, her work is duplicated or lost — and no amount of UI polish
 *  compensates for either.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A DATABASE. Skips cleanly when Docker is not running, because a red
 * suite that means "start Docker" trains people to ignore red suites.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { testApp, loginAs, authHeader, resetTables, body } from "./helpers.ts";
import { healthCheck, query } from "../src/db/pool.ts";

let token = "";
let dbUp = false;

/** Seeded by infra/seed/load.ts. Keep in step with it. */
const DEMO_PHONE = "+919000000001";
const DEMO_PASSWORD = "demo-asha-password";

before(async () => {
  dbUp = await healthCheck();
  if (!dbUp) return;
  const app = await testApp();
  token = await loginAs(app, DEMO_PHONE, DEMO_PASSWORD);
});

beforeEach(async () => {
  if (dbUp) await resetTables();
});

const skip = () => (dbUp ? false : "no database");

async function firstVillageId(): Promise<string> {
  const rows = await query<{ village_id: string }>("SELECT village_id FROM villages LIMIT 1");
  const row = rows[0];
  assert.ok(row, "seed data missing: run npm run db:seed");
  return row.village_id;
}

function reportOp(villageId: string) {
  const reportId = randomUUID();
  return {
    clientOpId: randomUUID(),
    opType: "TRIAGE_REPORT_CREATE" as const,
    clientCreatedAt: new Date().toISOString(),
    payload: {
      reportId,
      villageId,
      encounter: {
        patient: { ageMonths: 24, sex: "male", pregnancy: "no" },
        symptoms: ["FEVER"],
        answers: { DURATION_HOURS: 48 },
      },
      result: {
        tier: "PHC_SOON",
        decisionSource: "CLASSIFIER",
        redFlagHits: [],
        rulesetVersion: "redflags-v1.0.0",
        advice: ["Visit the health centre today."],
        disclaimer: "This is not a diagnosis.",
        evaluatedAt: new Date().toISOString(),
      },
      evaluatedOffline: true,
      createdAt: new Date().toISOString(),
    },
  };
}

async function pushBatch(operations: unknown[]) {
  const app = await testApp();
  return app.inject({
    method: "POST",
    url: "/sync/push",
    headers: authHeader(token),
    payload: { deviceId: "test-device-0001", operations },
  });
}

async function countReports(): Promise<number> {
  const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM triage_reports");
  const row = rows[0];
  assert.ok(row);
  return Number(row.n);
}

// ------------------------------------------------------------ idempotency

test("replaying an identical batch applies nothing twice", { skip: skip() }, async () => {
  const ops = [reportOp(await firstVillageId())];

  const first = await pushBatch(ops);
  assert.equal(first.statusCode, 200);
  const a = body<{ data: { results: Array<{ status: string; serverId?: string }> } }>(first);
  const firstResult = a.data.results[0];
  assert.ok(firstResult);
  assert.equal(firstResult.status, "APPLIED");
  assert.equal(await countReports(), 1);

  const second = await pushBatch(ops);
  assert.equal(second.statusCode, 200);
  const b = body<{ data: { results: Array<{ status: string; serverId?: string }> } }>(second);
  const secondResult = b.data.results[0];
  assert.ok(secondResult);
  assert.equal(secondResult.status, "DUPLICATE", "a replay must not re-apply");
  assert.equal(secondResult.serverId, firstResult.serverId, "the stored result is replayed verbatim");

  assert.equal(await countReports(), 1, "the replay must not create a second row");
});

test("reusing an op id with different content is REJECTED, not deduplicated", { skip: skip() }, async () => {
  const villageId = await firstVillageId();
  const op = reportOp(villageId);
  await pushBatch([op]);

  // Same clientOpId, different payload — the device's queue is corrupt.
  const tampered = { ...op, payload: { ...op.payload, reportId: randomUUID() } };
  const res = await pushBatch([tampered]);

  const parsed = body<{ data: { results: Array<{ status: string }> } }>(res);
  const result = parsed.data.results[0];
  assert.ok(result);
  assert.equal(result.status, "REJECTED");
  assert.equal(await countReports(), 1);
});

// ------------------------------------------------------------ partial failure

test("one bad operation does not reject the good ones beside it", { skip: skip() }, async () => {
  const villageId = await firstVillageId();
  const good = reportOp(villageId);
  const bad = {
    clientOpId: randomUUID(),
    opType: "TRIAGE_REPORT_CREATE" as const,
    clientCreatedAt: new Date().toISOString(),
    payload: { reportId: "not-a-uuid" },
  };

  const res = await pushBatch([good, bad]);
  assert.equal(res.statusCode, 200, "the transport succeeded; outcomes are per-operation");

  const parsed = body<{ data: { results: Array<{ status: string }> } }>(res);
  const r0 = parsed.data.results[0];
  const r1 = parsed.data.results[1];
  assert.ok(r0 && r1);
  assert.equal(r0.status, "APPLIED");
  assert.equal(r1.status, "REJECTED");
  assert.equal(await countReports(), 1);
});

test("every submitted operation gets exactly one result", { skip: skip() }, async () => {
  const villageId = await firstVillageId();
  const ops = [reportOp(villageId), reportOp(villageId), reportOp(villageId)];
  const res = await pushBatch(ops);

  const parsed = body<{ data: { results: Array<{ clientOpId: string }> } }>(res);
  assert.equal(parsed.data.results.length, ops.length);
  assert.deepEqual(
    parsed.data.results.map((r) => r.clientOpId).sort(),
    ops.map((o) => o.clientOpId).sort(),
    "results must be matchable by clientOpId",
  );
});

// ------------------------------------------------------------ auth

test("push requires authentication", { skip: skip() }, async () => {
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/sync/push",
    payload: { deviceId: "test-device-0001", operations: [reportOp(await firstVillageId())] },
  });
  assert.equal(res.statusCode, 401);
});

test("pull never returns patient data", { skip: skip() }, async () => {
  const app = await testApp();
  const res = await app.inject({
    method: "GET",
    url: "/sync/pull",
    headers: authHeader(token),
  });
  assert.equal(res.statusCode, 200);
  const parsed = body<{ data: Record<string, unknown> }>(res);
  for (const forbidden of ["triageReports", "visits", "householdVisits", "reports"]) {
    assert.equal(
      Object.hasOwn(parsed.data, forbidden),
      false,
      `pull must not return ${forbidden} — patient data goes up, never down`,
    );
  }
});
