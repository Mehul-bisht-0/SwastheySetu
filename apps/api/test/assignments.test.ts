/** STATUS: Implemented — Phase 1 authorization, lifecycle, race and retention tests. */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { config } from '../src/config.ts';
import { query, healthCheck, closePool } from '../src/db/pool.ts';
import { purgeExpired } from '../src/modules/assignments/repo.ts';
let app: FastifyInstance, ready = false;
const district = 'assignment-test-' + randomUUID(), foreign = 'assignment-test-' + randomUUID();
const village = randomUUID(), otherVillage = randomUUID();
const asha = randomUUID(), second = randomUUID(), supervisor = randomUUID(), outsider = randomUUID();
const tokens = new Map<string,string>();
const oldRetention = process.env['CASE_RETENTION_DAYS'];
before(async () => {
  if (config.NODE_ENV !== 'test' || !new URL(config.DATABASE_URL).pathname.endsWith('_test') || !await healthCheck()) return;
  process.env['CASE_RETENTION_DAYS'] = '7';
  app = await buildApp();
  await query("INSERT INTO districts(district_code,name,state_name) VALUES($1,'Test district','Test'),($2,'Other district','Test')",[district,foreign]);
  await query("INSERT INTO villages(village_id,district_code,name,centroid) VALUES($1,$2,'Assignment test village',ST_SetSRID(ST_MakePoint(85,25),4326)),($3,$4,'Other village',ST_SetSRID(ST_MakePoint(85,25),4326))",[village,district,otherVillage,foreign]);
  for (const [id,role,d] of [[asha,'ASHA',district],[second,'ASHA',district],[supervisor,'SUPERVISOR',district],[outsider,'ASHA',foreign]]) {
    await query('INSERT INTO users(user_id,phone,full_name,role,password_hash,district_code) VALUES($1,$2,$3,$4,$5,$6)',[id,'test-'+id,'Synthetic worker',role,'unused-test-hash',d]);
    tokens.set(id!,app.jwt.sign({ sub: id,role,district: d,did: 'assignment-test-device' }));
  }
  ready = true;
});
after(async () => {
  if (app) await app.close();
  if (ready) {
    await query('DELETE FROM worker_assignment_events WHERE district_code IN ($1,$2)',[district,foreign]);
    await query('DELETE FROM intake_cases WHERE district_code IN ($1,$2)',[district,foreign]);
    await query('DELETE FROM village_worker_assignments WHERE village_id IN ($1,$2)',[village,otherVillage]);
    await query('DELETE FROM villages WHERE district_code IN ($1,$2)',[district,foreign]);
    await query('DELETE FROM users WHERE district_code IN ($1,$2)',[district,foreign]);
    await query('DELETE FROM districts WHERE district_code IN ($1,$2)',[district,foreign]);
  }
  if (oldRetention === undefined) delete process.env['CASE_RETENTION_DAYS']; else process.env['CASE_RETENTION_DAYS'] = oldRetention;
  await closePool();
});
function call(id: string, url: string, body?: object) {
  return app.inject({ method: body ? 'POST' : 'GET',url: '/assignments' + url,headers: { authorization: 'Bearer ' + tokens.get(id) },...(body ? { payload: body } : {}) });
}
function intake() {
  return { caseId: randomUUID(),villageId: village,language: 'hi',synthetic: true,
    intake: { name: 'Private fictional name',phone: '0000000000',location: 'Private fictional location',reason: 'Private fictional concern' },
    transcript: 'Private fictional transcript',consent: { accepted: true,version: 'prototype-intake-v1',at: new Date().toISOString() },confirmedAt: new Date().toISOString() };
}
async function create(assigned: string | null = asha) {
  assert.equal((await call(supervisor,'/roster',{ villageId: village,ashaId: assigned })).statusCode,200);
  const body = intake(); const result = await call(asha,'/cases',body);
  assert.equal(result.statusCode,201,result.payload); return body;
}
test('assigned ASHA alone reads content; supervisors receive metadata and cannot forge an ASHA role',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create();
  assert.equal((await app.inject({ url: '/assignments/cases' })).statusCode,401);
  for (const id of [supervisor,second,outsider]) {
    const response = await call(id,'/cases/' + body.caseId);
    assert.ok([403,404].includes(response.statusCode)); assert.ok(!response.payload.includes('Private fictional'));
  }
  const meta = await call(supervisor,'/cases');
  assert.equal(meta.statusCode,200); assert.ok(meta.payload.includes(body.caseId)); assert.ok(!meta.payload.includes('Private fictional'));
  assert.equal(meta.headers['cache-control'],'no-store');
  const detail = await call(asha,'/cases/' + body.caseId);
  assert.equal(detail.statusCode,200); assert.ok(detail.payload.includes(body.transcript)); assert.equal(detail.json().data.summaryStatus,'NOT_IMPLEMENTED');
  const original = tokens.get(supervisor)!;
  tokens.set(supervisor,app.jwt.sign({ sub: supervisor,role: 'ASHA',district,did: 'test' }));
  assert.equal((await call(supervisor,'/cases/' + body.caseId)).statusCode,403);
  tokens.set(supervisor,original);
  const history = await call(supervisor,'/cases/' + body.caseId + '/history');
  assert.ok(history.payload.includes('CONTENT_VIEWED')); assert.ok(!history.payload.includes(body.transcript));
});
test('unassigned queue and roster changes do not silently move existing cases',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create(null);
  assert.equal((await call(asha,'/cases/' + body.caseId)).statusCode,404);
  assert.equal((await call(supervisor,'/roster',{ villageId: village,ashaId: asha })).statusCode,200);
  let row = (await query<{ assigned_asha_id: string | null }>('SELECT assigned_asha_id FROM intake_cases WHERE case_id=$1',[body.caseId]))[0]!;
  assert.equal(row.assigned_asha_id,null);
  assert.equal((await call(supervisor,'/cases/' + body.caseId,{ action: 'REASSIGN',version: 1,ashaId: asha })).statusCode,200);
  row = (await query<{ assigned_asha_id: string | null }>('SELECT assigned_asha_id FROM intake_cases WHERE case_id=$1',[body.caseId]))[0]!;
  assert.equal(row.assigned_asha_id,asha);
  assert.equal((await call(asha,'/roster',{ villageId: village,ashaId: asha })).statusCode,403);
  assert.equal((await call(supervisor,'/roster',{ villageId: otherVillage,ashaId: asha })).statusCode,404);
  assert.equal((await call(supervisor,'/roster',{ villageId: village,ashaId: outsider })).statusCode,400);
});
test('handoff retains owner, reassignment revokes prior access, stale transitions fail',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create(); const path = '/cases/' + body.caseId;
  assert.equal((await call(asha,path,{ action: 'CLOSE',version: 1 })).statusCode,409);
  assert.equal((await call(asha,path,{ action: 'ACKNOWLEDGE',version: 1 })).statusCode,200);
  assert.equal((await call(asha,path,{ action: 'HANDOFF',version: 2,reason: 'UNDERSTANDING_DIFFICULTY' })).statusCode,200);
  assert.equal((await call(asha,path)).statusCode,200);
  assert.equal((await call(supervisor,path,{ action: 'REASSIGN',version: 3,ashaId: second })).statusCode,200);
  assert.equal((await call(asha,path)).statusCode,404);
  assert.equal((await call(asha,path + '/history')).statusCode,404);
  assert.equal((await call(second,path,{ action: 'ACKNOWLEDGE',version: 3 })).statusCode,409);
  assert.equal((await call(second,path,{ action: 'ACKNOWLEDGE',version: 4 })).statusCode,200);
  assert.equal((await call(second,path,{ action: 'CLOSE',version: 5 })).statusCode,200);
  assert.equal((await call(supervisor,path,{ action: 'REASSIGN',version: 6,ashaId: asha })).statusCode,409);
});
test('concurrent reassignment commits once with one audit event',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create(); const path = '/cases/' + body.caseId;
  const results = await Promise.all([call(supervisor,path,{ action: 'REASSIGN',version: 1,ashaId: second }),call(supervisor,path,{ action: 'REASSIGN',version: 1,ashaId: second })]);
  assert.deepEqual(results.map(r => r.statusCode).sort(),[200,409]);
  assert.equal((await query("SELECT event_id FROM worker_assignment_events WHERE case_id=$1 AND action='REASSIGN'",[body.caseId])).length,1);
});
test('consent, confirmation and retention are required; duplicate submissions never overwrite content',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create();
  assert.equal((await call(asha,'/cases',body)).statusCode,409);
  assert.equal((await call(asha,'/cases',{ ...intake(),consent: { ...body.consent,accepted: false } })).statusCode,400);
  assert.equal((await call(asha,'/cases',{ ...intake(),confirmedAt: '2099-01-01T00:00:00.000Z' })).statusCode,400);
  assert.equal((await call(asha,'/cases',{ ...intake(),synthetic: false })).statusCode,400);
  delete process.env['CASE_RETENTION_DAYS'];
  assert.equal((await call(asha,'/cases',intake())).statusCode,400);
  process.env['CASE_RETENTION_DAYS'] = '7';
});
test('inactive workers lose access; expired content is inaccessible and purged with its events',async t => {
  if (!ready) return t.skip('requires isolated *_test database');
  const body = await create();
  await query('UPDATE users SET is_active=false WHERE user_id=$1',[asha]);
  assert.equal((await call(asha,'/cases/' + body.caseId)).statusCode,403);
  assert.equal((await call(supervisor,'/roster',{ villageId: village,ashaId: asha })).statusCode,400);
  await query('UPDATE users SET is_active=true WHERE user_id=$1',[asha]);
  await query("UPDATE intake_cases SET expires_at=now()-interval '1 second' WHERE case_id=$1",[body.caseId]);
  assert.equal((await call(asha,'/cases/' + body.caseId)).statusCode,404);
  assert.ok(!(await call(supervisor,'/cases')).payload.includes(body.caseId));
  await purgeExpired();
  assert.equal((await query('SELECT case_id FROM intake_cases WHERE case_id=$1',[body.caseId])).length,0);
  assert.equal((await query('SELECT event_id FROM worker_assignment_events WHERE case_id=$1',[body.caseId])).length,0);
});
