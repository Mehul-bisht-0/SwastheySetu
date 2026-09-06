/** STATUS: Implemented — assignment workflow; no clinical or AI decisions. */
import * as repo from './repo.ts';
import type pg from 'pg';
import type { CaseMetadata, ChangeCase, CreateCase } from '@swasthyasetu/contracts/assignments';
import { badRequest, conflict, forbidden, notFound } from '../../plugins/errors.ts';

function expiry() {
  const days = Number(process.env['CASE_RETENTION_DAYS']);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw badRequest('Configure CASE_RETENTION_DAYS before collecting prototype intake.');
  return new Date(Date.now() + days * 86400000);
}
async function asActor<T>(id: string, fn: (db: pg.PoolClient, user: repo.Actor) => Promise<T>) {
  return repo.transaction(async db => {
    const user = await repo.actor(db,id);
    if (!user) throw forbidden();
    return fn(db,user);
  });
}
function manager(user: repo.Actor) { if (user.role === 'ASHA') throw forbidden(); }
export const directory = (id: string) => asActor(id,repo.directory);
export const list = (id: string, offset: number) => asActor(id, async (db,user) => ({ items: await repo.metadata(db,user,offset) }));
export const setRoster = (id: string, villageId: string, ashaId: string | null) => asActor(id,async (db,user) => {
  manager(user);
  const expires = expiry();
  if (!await repo.village(db,villageId,user.district_code)) throw notFound();
  if (ashaId && !await repo.worker(db,ashaId,user.district_code)) throw badRequest('Choose an active ASHA in your district.');
  await repo.setRoster(db,villageId,ashaId,id);
  await repo.audit(db,user,'ROSTER_CHANGED',expires,null,villageId,ashaId);
  return { saved: true };
});
export const create = (id: string, input: CreateCase) => asActor(id,async (db,user) => {
  // Phase 1 has an authenticated manual/synthetic seam. No public caller endpoint yet.
  if (user.role !== 'ASHA') throw forbidden();
  const expires = expiry();
  if (Date.parse(input.consent.at)>Date.parse(input.confirmedAt) || Date.parse(input.confirmedAt)>Date.now()) throw badRequest('Consent must precede confirmation, and timestamps cannot be in the future.');
  if (!await repo.village(db,input.villageId,user.district_code)) throw notFound();
  const assigned = await repo.primary(db,input.villageId,user.district_code);
  if (!await repo.insert(db,input,user,assigned,expires)) throw conflict('Case already submitted. Refresh the inbox before submitting another case.');
  await repo.audit(db,user,'CREATED',expires,input.caseId,input.villageId,assigned);
  return { caseId: input.caseId, assignedAshaId: assigned, status: assigned ? 'ASSIGNED' : 'UNASSIGNED' };
});
export const detail = (id: string, caseId: string) => asActor(id,async (db,user) => {
  if (user.role !== 'ASHA') throw forbidden();
  const row = await repo.lockedCase(db,user,caseId);
  if (!row) throw notFound();
  const content = await repo.detail(db,user,caseId);
  if (!content) throw notFound();
  await repo.audit(db,user,'CONTENT_VIEWED',new Date(row.expires_at),caseId,row.village_id);
  return { ...row, ...content, summary: null, summaryStatus: 'NOT_IMPLEMENTED' as const };
});
export const history = (id: string, caseId: string) => asActor(id,async (db,user) => {
  if (!await repo.lockedCase(db,user,caseId)) throw notFound();
  return { items: await repo.events(db,user,caseId) };
});
export const change = (id: string, caseId: string, input: ChangeCase) => asActor(id,async (db,user) => {
  const row = await repo.lockedCase(db,user,caseId);
  if (!row) throw notFound();
  if (input.version !== row.version) throw conflict('This case changed. Refresh before retrying.');
  if (row.status === 'CLOSED') throw conflict('Case is closed.');
  let status: CaseMetadata['status'] = row.status;
  let assigned = row.assigned_asha_id, reason = row.handoff_reason;
  if (input.action === 'REASSIGN') {
    manager(user);
    if (!input.ashaId || !await repo.worker(db,input.ashaId,user.district_code)) throw badRequest('Choose an active ASHA in your district.');
    if (input.ashaId === assigned) throw conflict('Choose a different worker.');
    assigned = input.ashaId; status = 'ASSIGNED'; reason = null;
  } else {
    if (user.role !== 'ASHA' || assigned !== id) throw forbidden();
    if (input.action === 'ACKNOWLEDGE') {
      if (status !== 'ASSIGNED') throw conflict('Only a newly assigned case can be acknowledged.');
      status = 'ACKNOWLEDGED';
    } else if (input.action === 'HANDOFF') {
      if (!input.reason) throw badRequest('Choose a handoff reason.');
      status = 'HANDOFF_REQUESTED'; reason = input.reason;
    } else {
      if (status !== 'ACKNOWLEDGED') throw conflict('Acknowledge the case before recording completed human follow-up.');
      status = 'CLOSED';
    }
  }
  await repo.update(db,caseId,status,assigned,reason);
  await repo.audit(db,user,input.action,new Date(row.expires_at),caseId,row.village_id,assigned);
  return { status, version: row.version + 1 };
});
