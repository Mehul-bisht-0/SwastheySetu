/** STATUS: Implemented — Stage 2 Phase 2 state, privacy, replay and assignment tests. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { config } from '../src/config.ts';
import { closePool, healthCheck, query } from '../src/db/pool.ts';

let app: FastifyInstance, ready=false;
const district='ivr-test-'+randomUUID(), village=randomUUID(), asha=randomUUID(), supervisor=randomUUID();
const dialCode=String(Math.floor(100000+Math.random()*899999));
const secret='ivr-test-secret-0123456789-abcdef';
const oldSecret=process.env['IVR_WEBHOOK_SECRET'], oldRetention=process.env['CASE_RETENTION_DAYS'];
let eventCounter=0;

before(async () => {
  if (config.NODE_ENV !== 'test' || !new URL(config.DATABASE_URL).pathname.endsWith('_test') || !await healthCheck()) return;
  process.env['IVR_WEBHOOK_SECRET']=secret; process.env['CASE_RETENTION_DAYS']='7';
  app=await buildApp();
  await query("INSERT INTO districts(district_code,name,state_name) VALUES($1,'IVR district','Test')",[district]);
  await query("INSERT INTO villages(village_id,district_code,name,centroid) VALUES($1,$2,'IVR village',ST_SetSRID(ST_MakePoint(85,25),4326))",[village,district]);
  for (const [id,role] of [[asha,'ASHA'],[supervisor,'SUPERVISOR']]) {
    await query('INSERT INTO users(user_id,phone,full_name,role,password_hash,district_code) VALUES($1,$2,$3,$4,$5,$6)',[id,'test-'+id,'Synthetic IVR worker',role,'unused-test-hash',district]);
  }
  await query('INSERT INTO village_worker_assignments(village_id,asha_id,updated_by) VALUES($1,$2,$3)',[village,asha,supervisor]);
  await query('INSERT INTO ivr_village_routes(dial_code,village_id,updated_by) VALUES($1,$2,$3)',[dialCode,village,supervisor]);
  ready=true;
});

after(async () => {
  if (app) await app.close();
  if (ready) {
    await query('DELETE FROM ivr_provider_events WHERE call_id IN (SELECT call_id FROM ivr_calls WHERE provider_call_id LIKE $1)',['ivr-test-%']);
    await query('DELETE FROM ivr_calls WHERE provider_call_id LIKE $1',['ivr-test-%']);
    await query('DELETE FROM worker_assignment_events WHERE district_code=$1',[district]);
    await query('DELETE FROM intake_cases WHERE district_code=$1',[district]);
    await query('DELETE FROM ivr_village_routes WHERE village_id=$1',[village]);
    await query('DELETE FROM village_worker_assignments WHERE village_id=$1',[village]);
    await query('DELETE FROM users WHERE district_code=$1',[district]);
    await query('DELETE FROM villages WHERE district_code=$1',[district]);
    await query('DELETE FROM districts WHERE district_code=$1',[district]);
  }
  if (oldSecret === undefined) delete process.env['IVR_WEBHOOK_SECRET']; else process.env['IVR_WEBHOOK_SECRET']=oldSecret;
  if (oldRetention === undefined) delete process.env['CASE_RETENTION_DAYS']; else process.env['CASE_RETENTION_DAYS']=oldRetention;
  await closePool();
});

function webhook(callId: string,type: 'START'|'DTMF'|'TIMEOUT'|'HANGUP',digits?: string,eventId=`ivr-event-${++eventCounter}`) {
  return app.inject({ method:'POST',url:'/ivr/webhooks/prototype',headers:{ 'x-ivr-webhook-secret':secret },payload:{ eventId,callId,type,
    ...(type==='START'?{ callerNumber:'+919876543210' }:{}),...(digits?{ digits }:{}), } });
}
async function digit(callId: string,value: string) { const response=await webhook(callId,'DTMF',value); assert.equal(response.statusCode,200,response.payload); return response; }
async function reachVillage(callId: string) {
  assert.equal((await webhook(callId,'START')).statusCode,200);
  await digit(callId,'2'); await digit(callId,'1'); await digit(callId,'1'); await digit(callId,dialCode+'#');
}
async function token(id: string,role: string) { return app.jwt.sign({ sub:id,role,district,did:'ivr-test-device' }); }

test('provider authentication is mandatory and unsupported providers are rejected',async t => {
  if (!ready) return t.skip('requires isolated *_test database with migration 013');
  const body={ eventId:'auth-test',callId:'ivr-test-auth',type:'START',callerNumber:'+919876543210' };
  assert.equal((await app.inject({ method:'POST',url:'/ivr/webhooks/prototype',payload:body })).statusCode,401);
  assert.equal((await app.inject({ method:'POST',url:'/ivr/webhooks/other',headers:{'x-ivr-webhook-secret':secret},payload:body })).statusCode,400);
});

test('completed keypad intake is replay-safe and uses Phase 1 worker assignment/privacy',async t => {
  if (!ready) return t.skip('requires isolated *_test database with migration 013');
  const callId='ivr-test-complete-'+randomUUID(); await reachVillage(callId);
  await digit(callId,'1'); await digit(callId,'2'); await digit(callId,'1');
  const eventId='ivr-final-'+randomUUID();
  const first=await webhook(callId,'DTMF','1',eventId), replay=await webhook(callId,'DTMF','1',eventId);
  assert.equal(first.statusCode,200,first.payload); assert.deepEqual(replay.json(),first.json());
  const rows=await query<{case_id:string;assigned_asha_id:string;status:string;source:string;intake_complete:boolean;created_by:string|null;intake:Record<string,string>}>(
    'SELECT case_id,assigned_asha_id,status,source,intake_complete,created_by,intake FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[callId]);
  assert.equal(rows.length,1); const row=rows[0]!;
  assert.equal(row.assigned_asha_id,asha); assert.equal(row.status,'ASSIGNED'); assert.equal(row.source,'KEYPAD_IVR'); assert.equal(row.intake_complete,true); assert.equal(row.created_by,null);
  assert.equal(row.intake.phone,'+919876543210');
  assert.equal((await query('SELECT case_id FROM intake_cases WHERE district_code=$1',[district])).length,1);
  assert.equal((await webhook(callId,'HANGUP')).statusCode,200);
  assert.equal((await query('SELECT case_id FROM intake_cases WHERE district_code=$1',[district])).length,1);
  const supervisorResponse=await app.inject({url:'/assignments/cases/'+row.case_id,headers:{authorization:'Bearer '+await token(supervisor,'SUPERVISOR')}});
  assert.equal(supervisorResponse.statusCode,403); assert.ok(!supervisorResponse.payload.includes('9876543210'));
  const ashaResponse=await app.inject({url:'/assignments/cases/'+row.case_id,headers:{authorization:'Bearer '+await token(asha,'ASHA')}});
  assert.equal(ashaResponse.statusCode,200); assert.ok(ashaResponse.payload.includes('9876543210')); assert.equal(ashaResponse.json().data.transcript,null);
});

test('unsure category creates a human-handoff indicator without clinical logic',async t => {
  if (!ready) return t.skip('requires isolated *_test database with migration 013');
  const callId='ivr-test-unsure-'+randomUUID(); await reachVillage(callId);
  await digit(callId,'4'); await digit(callId,'4'); await digit(callId,'3'); await digit(callId,'1');
  const [row]=await query<{status:string;handoff_reason:string}>('SELECT status,handoff_reason FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[callId]);
  assert.equal(row?.status,'HANDOFF_REQUESTED'); assert.equal(row?.handoff_reason,'UNSUPPORTED_REQUEST');
});

test('invalid input, timeout and hang-up fail gracefully and preserve only confirmed checkpoints',async t => {
  if (!ready) return t.skip('requires isolated *_test database with migration 013');
  const invalidCall='ivr-test-invalid-'+randomUUID(); await reachVillage(invalidCall);
  await digit(invalidCall,'9'); await digit(invalidCall,'9'); const failed=await digit(invalidCall,'9');
  assert.equal(failed.json().state,'FAILED');
  const [incomplete]=await query<{intake_complete:boolean;handoff_reason:string}>('SELECT intake_complete,handoff_reason FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[invalidCall]);
  assert.equal(incomplete?.intake_complete,false); assert.equal(incomplete?.handoff_reason,'UNDERSTANDING_DIFFICULTY');

  const early='ivr-test-timeout-'+randomUUID(); assert.equal((await webhook(early,'START')).statusCode,200);
  await webhook(early,'TIMEOUT'); await webhook(early,'TIMEOUT'); const timedOut=await webhook(early,'TIMEOUT');
  assert.equal(timedOut.json().state,'FAILED');
  assert.equal((await query('SELECT case_id FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[early])).length,0);

  const dropped='ivr-test-hangup-'+randomUUID(); await reachVillage(dropped); const hung=await webhook(dropped,'HANGUP');
  assert.equal(hung.json().state,'HUNG_UP');
  const [droppedCase]=await query<{intake_complete:boolean;handoff_reason:string}>('SELECT intake_complete,handoff_reason FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[dropped]);
  assert.equal(droppedCase?.intake_complete,false); assert.equal(droppedCase?.handoff_reason,'CALLER_REQUEST');
});

test('same provider event processed concurrently creates exactly one case',async t => {
  if (!ready) return t.skip('requires isolated *_test database with migration 013');
  const callId='ivr-test-concurrent-'+randomUUID(); await reachVillage(callId);
  await digit(callId,'1'); await digit(callId,'1'); await digit(callId,'1');
  const eventId='ivr-concurrent-final-'+randomUUID();
  const results=await Promise.all([webhook(callId,'DTMF','1',eventId),webhook(callId,'DTMF','1',eventId)]);
  assert.deepEqual(results.map(result=>result.statusCode),[200,200]); assert.deepEqual(results[0]!.json(),results[1]!.json());
  assert.equal((await query('SELECT case_id FROM intake_cases WHERE case_id=(SELECT case_id FROM ivr_calls WHERE provider_call_id=$1)',[callId])).length,1);
  assert.equal((await query('SELECT provider_event_id FROM ivr_provider_events WHERE provider_event_id=$1',[eventId])).length,1);
});
