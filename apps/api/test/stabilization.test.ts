/** Stabilization regression coverage. Uses an explicitly named test database only. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app.ts";
import { config } from "../src/config.ts";
import { query, healthCheck, closePool } from "../src/db/pool.ts";
import { evaluate } from "../src/modules/triage/service.ts";
import { sync as contracts } from "@swasthyasetu/contracts";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance;
let ready = false;
let villageId = "", facilityId = "", token = "", otherToken = "";
const deviceId = "stabilization-" + randomUUID();
before(async () => {
  if (config.NODE_ENV !== "test" || !new URL(config.DATABASE_URL).pathname.endsWith("_test") || !(await healthCheck())) return;
  const users = await query<{ user_id: string; district_code: string }>("SELECT user_id,district_code FROM users ORDER BY phone LIMIT 2");
  assert.equal(users.length, 2, "seed the isolated test database first");
  const villages = await query<{ village_id: string }>("SELECT village_id FROM villages WHERE district_code=$1 LIMIT 1", [users[0]!.district_code]);
  const facilities = await query<{ facility_id: string }>("SELECT facility_id FROM facilities WHERE district_code=$1 LIMIT 1", [users[0]!.district_code]);
  villageId = villages[0]!.village_id; facilityId = facilities[0]!.facility_id;
  app = await buildApp();
  token = app.jwt.sign({ sub: users[0]!.user_id, role: "ASHA", district: users[0]!.district_code, did: deviceId });
  otherToken = app.jwt.sign({ sub: users[1]!.user_id, role: "ASHA", district: users[1]!.district_code, did: "other-device-test" });
  ready = true;
});
after(async () => {
  if (ready) {
    await query('DELETE FROM sync_operations WHERE device_id=$1', [deviceId]);
    await query('DELETE FROM triage_reports WHERE device_id=$1', [deviceId]);
    await query('DELETE FROM household_visits WHERE device_id=$1', [deviceId]);
    await query('DELETE FROM facility_activity WHERE device_id=$1', [deviceId]);
    await query('DELETE FROM devices WHERE device_id=$1', [deviceId]);
  }
  if (app) await app.close(); await closePool();
});
function report() {
  const encounter = { patient: { ageMonths: 300, sex: "male" as const, pregnancy: "no" as const }, symptoms: ["COUGH" as const], answers: { DURATION_HOURS: 12 } };
  return { clientOpId: randomUUID(), opType: "TRIAGE_REPORT_CREATE" as const, clientCreatedAt: new Date().toISOString(), payload: {
    reportId: randomUUID(), villageId, encounter, result: evaluate(encounter), evaluatedOffline: true, createdAt: new Date().toISOString(),
  } };
}
function visit(version = 1, id = randomUUID()) {
  return { clientOpId: randomUUID(), opType: "HOUSEHOLD_VISIT_UPSERT" as const, entityVersion: version, clientCreatedAt: new Date().toISOString(), payload: {
    visitId: id, villageId, householdCode: 'STABILIZATION', visitedAt: new Date().toISOString(), membersSeen: 1,
    dangerSigns: [], referralMade: false, findings: {}, entityVersion: version, createdAt: new Date().toISOString(),
  } };
}
async function push(operations: unknown[]) {
  const response = await app.inject({ method: 'POST', url: '/sync/push', headers: { authorization: 'Bearer ' + token }, payload: { deviceId, operations } });
  assert.equal(response.statusCode, 200, response.payload);
  return contracts.pushResponse.parse(JSON.parse(response.payload).data);
}
test('concurrent replay writes once and preserves client/server results', async t => {
  if (!ready) return t.skip('requires NODE_ENV=test and a seeded *_test database');
  const op = report();
  const results = await Promise.all([push([op]), push([op])]);
  assert.deepEqual(results.map(r => r.results[0]!.status).sort(), ['APPLIED', 'DUPLICATE']);
  const rows = await query<{ client_result: unknown; server_result: unknown }>('SELECT client_result,server_result FROM triage_reports WHERE report_id=$1', [op.payload.reportId]);
  assert.equal(rows.length, 1); assert.ok(rows[0]!.client_result); assert.ok(rows[0]!.server_result);
  assert.equal((await push([{ ...op, payload: { ...op.payload, villageId: null } }])).results[0]!.status, 'REJECTED');
});
test('mixed operations apply independently; malformed and future signals remain rejected', async t => {
  if (!ready) return t.skip('requires isolated test database');
  const signal = { clientOpId: randomUUID(), opType: 'FACILITY_SIGNAL_CREATE', clientCreatedAt: new Date().toISOString(), payload: {
    activityId: randomUUID(), facilityId, signalType: 'STAFF_PRESENT', observedAt: new Date().toISOString(),
  } };
  const bad = { ...report(), payload: { reportId: 'invalid' } };
  const result = await push([report(), bad, visit(), signal]);
  assert.deepEqual(result.results.map(r => r.status), ['APPLIED', 'REJECTED', 'APPLIED', 'APPLIED']);
  const future = { ...signal, clientOpId: randomUUID(), payload: { ...signal.payload, activityId: randomUUID(), observedAt: '2099-01-01T00:00:00Z' } };
  assert.equal((await push([future])).results[0]!.status, 'REJECTED');
  assert.equal((await push([future])).results[0]!.status, 'REJECTED');
});
test('stale visit conflicts replay as conflicts; another worker cannot overwrite a visit', async t => {
  if (!ready) return t.skip('requires isolated test database');
  const op = visit(2);
  assert.equal((await push([op])).results[0]!.status, 'APPLIED');
  const stale = visit(1, op.payload.visitId);
  assert.equal((await push([stale])).results[0]!.status, 'CONFLICT');
  assert.equal((await push([stale])).results[0]!.status, 'CONFLICT');
  const response = await app.inject({ method: 'POST', url: '/asha/visits', headers: { authorization: 'Bearer ' + otherToken }, payload: visit(3, op.payload.visitId).payload });
  assert.equal(response.statusCode, 409);
  const rows = await query<{ entity_version: number }>('SELECT entity_version FROM household_visits WHERE visit_id=$1', [op.payload.visitId]);
  assert.equal(rows[0]!.entity_version, 2);
});
test('reference cursor traverses every collection and never returns patient data', async t => {
  if (!ready) return t.skip('requires isolated test database');
  const ids = new Set<string>();
  let cursor: string | null = null, pages = 0;
  do {
    const response = await app.inject({ method: 'GET', url: '/sync/pull?limit=17' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), headers: { authorization: 'Bearer ' + token } });
    assert.equal(response.statusCode, 200, response.payload);
    const data = contracts.pullResponse.parse(JSON.parse(response.payload).data);
    for (const f of data.facilities.items) ids.add('f:' + f.facilityId);
    for (const v of data.villages.items) ids.add('v:' + v.villageId);
    cursor = data.facilities.nextCursor;
    assert.ok(++pages < 1000, 'pagination did not terminate');
    assert.equal(/householdVisits|triageReports/.test(response.payload), false);
  } while (cursor);
  const rows = await query<{ n: string }>('SELECT ((SELECT count(*) FROM facilities)+(SELECT count(*) FROM villages))::text AS n');
  assert.equal(ids.size, Number(rows[0]!.n));
});
