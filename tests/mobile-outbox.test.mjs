// Regression checks use real SQLite and the production outbox DAO, with only Expo's DB adapter replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../apps/mobile/src/db/schema.sql', import.meta.url), 'utf8'));
const adapter = {
  runSync: (sql, params = []) => sqlite.prepare(sql).run(...params),
  getAllSync: (sql, params = []) => sqlite.prepare(sql).all(...params),
  getFirstSync: (sql, params = []) => sqlite.prepare(sql).get(...params),
};
globalThis.outboxTestAdapter = adapter;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../client.ts' && context.parentURL?.endsWith('/db/dao/outbox.ts')) {
    return { url: 'data:text/javascript,' + encodeURIComponent('export const getDb=()=>globalThis.outboxTestAdapter; export const tx=fn=>fn(getDb());'), shortCircuit: true };
  }
  return next(specifier, context);
} });
const outbox = await import('../apps/mobile/src/db/dao/outbox.ts');
function reset() { sqlite.exec('DELETE FROM outbox; DELETE FROM household_visits_local; DELETE FROM triage_reports_local;'); }
function visit(version) {
  adapter.runSync("INSERT OR REPLACE INTO household_visits_local(visit_id,household_code,village_id,visited_at,entity_version,payload_json,pending,conflict) VALUES ('visit','house','village','2026-01-01',?,'{}',1,0)", [version]);
}
function enqueue(id, version) { outbox.enqueue({ clientOpId: id, opType: 'HOUSEHOLD_VISIT_UPSERT', payload: { visitId: 'visit', entityVersion: version }, clientCreatedAt: '2026-01-01T00:00:00Z' }); }
test('a successful acknowledgement clears pending before deleting its payload', () => {
  reset(); visit(1); enqueue('op1', 1); outbox.claimBatch();
  outbox.applyResults([{ clientOpId: 'op1', status: 'APPLIED' }]);
  assert.equal(adapter.getFirstSync('SELECT pending FROM household_visits_local').pending, 0);
  assert.equal(outbox.counts().pending, 0);
});
test('a delayed old acknowledgement cannot mark a newer local edit sent', () => {
  reset(); visit(2); enqueue('op1', 1); enqueue('op2', 2);
  outbox.applyResults([{ clientOpId: 'op1', status: 'DUPLICATE' }]);
  assert.equal(adapter.getFirstSync('SELECT pending FROM household_visits_local').pending, 1);
  assert.equal(outbox.counts().pending, 1);
});
test('startup recovers every interrupted send, including legacy null timestamps', () => {
  reset(); enqueue('op1', 1); enqueue('op2', 2); outbox.claimBatch();
  adapter.runSync("UPDATE outbox SET last_attempt_at=NULL WHERE client_op_id='op1'");
  outbox.releaseStale();
  assert.equal(outbox.claimBatch().length, 2);
});
test('conflicts retain the visit and surface a flag; rejection retains the queue payload', () => {
  reset(); visit(1); enqueue('op1', 1);
  outbox.applyResults([{ clientOpId: 'op1', status: 'CONFLICT' }]);
  assert.equal(adapter.getFirstSync('SELECT conflict FROM household_visits_local').conflict, 1);
  enqueue('op2', 2);
  outbox.applyResults([{ clientOpId: 'op2', status: 'REJECTED', message: 'Review required' }]);
  assert.equal(outbox.counts().rejected, 1);
  assert.equal(adapter.getFirstSync('SELECT last_error FROM outbox').last_error, 'Review required');
});
test('network failure leaves the operation pending with backoff', () => {
  reset(); enqueue('op1', 1); outbox.claimBatch(); outbox.releaseBatch(['op1'], 'timeout');
  assert.equal(outbox.counts().pending, 1);
  assert.equal(outbox.claimBatch().length, 0);
  assert.equal(outbox.claimBatch(50, true).length, 1);
});
