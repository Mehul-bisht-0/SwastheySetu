/** STATUS: Implemented — SQL and atomic assignment/audit persistence. */
import type pg from 'pg';
import { pool } from '../../db/pool.ts';
import type { CaseMetadata, CreateCase } from '@swasthyasetu/contracts/assignments';

export interface IvrCaseInput {
  caseId: string; villageId: string; districtCode: string; language: 'hi'|'en';
  intake: CreateCase['intake']; consentVersion: string; consentAt: string; confirmedAt: string;
  complete: boolean; handoffReason: CaseMetadata['handoff_reason'];
}

export interface Actor { user_id: string; district_code: string; role: 'ASHA' | 'SUPERVISOR' | 'ADMIN' }
export async function transaction<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export async function actor(db: pg.PoolClient, id: string) {
  return (await db.query<Actor>('SELECT user_id,district_code,role FROM users WHERE user_id=$1 AND is_active=true FOR SHARE', [id])).rows[0];
}
export async function village(db: pg.PoolClient, id: string, district: string) {
  // Serializes roster changes and new intake assignment, even with no roster row.
  return (await db.query('SELECT village_id FROM villages WHERE village_id=$1 AND district_code=$2 FOR UPDATE', [id,district])).rows.length > 0;
}
export async function worker(db: pg.PoolClient, id: string, district: string) {
  return (await db.query("SELECT user_id FROM users WHERE user_id=$1 AND district_code=$2 AND role='ASHA' AND is_active=true FOR SHARE", [id,district])).rows.length > 0;
}
export async function primary(db: pg.PoolClient, villageId: string, district: string) {
  return (await db.query<{ asha_id: string }>(`SELECT a.asha_id FROM village_worker_assignments a JOIN users u ON u.user_id=a.asha_id
    WHERE a.village_id=$1 AND u.district_code=$2 AND u.is_active=true AND u.role='ASHA' FOR SHARE OF u`, [villageId,district])).rows[0]?.asha_id ?? null;
}
export async function setRoster(db: pg.PoolClient, villageId: string, ashaId: string | null, by: string) {
  if (ashaId === null) { await db.query('DELETE FROM village_worker_assignments WHERE village_id=$1', [villageId]); return; }
  await db.query(`INSERT INTO village_worker_assignments(village_id,asha_id,updated_by) VALUES($1,$2,$3)
    ON CONFLICT(village_id) DO UPDATE SET asha_id=$2,updated_by=$3,updated_at=now()`, [villageId,ashaId,by]);
}
export async function audit(db: pg.PoolClient, user: Actor, action: string, expiresAt: Date, caseId: string | null, villageId: string | null, target: string | null = null) {
  await db.query(`INSERT INTO worker_assignment_events(case_id,village_id,district_code,actor_id,action,target_asha_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [caseId,villageId,user.district_code,user.user_id,action,target,expiresAt]);
}
export async function insert(db: pg.PoolClient, input: CreateCase, user: Actor, ashaId: string | null, expires: Date) {
  return (await db.query(`INSERT INTO intake_cases(case_id,district_code,village_id,assigned_asha_id,created_by,language,status,intake,
    transcript,consent_version,consent_at,confirmed_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(case_id) DO NOTHING RETURNING case_id`, [input.caseId,user.district_code,input.villageId,ashaId,user.user_id,input.language,
    ashaId ? 'ASSIGNED' : 'UNASSIGNED',input.intake,input.transcript ?? null,input.consent.version,input.consent.at,input.confirmedAt,expires])).rows.length > 0;
}
export async function insertIvr(db: pg.PoolClient, input: IvrCaseInput, ashaId: string | null, expires: Date) {
  const status: CaseMetadata['status'] = ashaId === null ? 'UNASSIGNED' : input.handoffReason ? 'HANDOFF_REQUESTED' : 'ASSIGNED';
  return (await db.query(`INSERT INTO intake_cases(case_id,district_code,village_id,assigned_asha_id,created_by,language,status,handoff_reason,intake,
    transcript,consent_version,consent_at,confirmed_at,expires_at,source,intake_complete)
    VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,NULL,$9,$10,$11,$12,'KEYPAD_IVR',$13)
    ON CONFLICT(case_id) DO NOTHING RETURNING case_id`,[input.caseId,input.districtCode,input.villageId,ashaId,input.language,status,
    input.handoffReason,input.intake,input.consentVersion,input.consentAt,input.confirmedAt,expires,input.complete])).rows.length > 0;
}
export async function auditSystem(db: pg.PoolClient, district: string, action: string, expiresAt: Date, caseId: string, villageId: string, target: string | null) {
  await db.query(`INSERT INTO worker_assignment_events(case_id,village_id,district_code,actor_id,action,target_asha_id,expires_at)
    VALUES($1,$2,$3,NULL,$4,$5,$6)`,[caseId,villageId,district,action,target,expiresAt]);
}
export async function metadata(db: pg.PoolClient, user: Actor, offset: number) {
  return (await db.query<CaseMetadata>(`SELECT case_id,village_id,assigned_asha_id,language,status,handoff_reason,version,source,intake_complete,created_at,updated_at,expires_at
    FROM intake_cases WHERE district_code=$1 AND expires_at>now() AND ($2::boolean OR assigned_asha_id=$3)
    ORDER BY created_at DESC,case_id DESC LIMIT 50 OFFSET $4`, [user.district_code,user.role !== 'ASHA',user.user_id,offset])).rows;
}
export async function lockedCase(db: pg.PoolClient, user: Actor, id: string) {
  return (await db.query<CaseMetadata>(`SELECT case_id,village_id,assigned_asha_id,language,status,handoff_reason,version,source,intake_complete,created_at,updated_at,expires_at
    FROM intake_cases WHERE case_id=$1 AND district_code=$2 AND expires_at>now() AND ($3::boolean OR assigned_asha_id=$4) FOR UPDATE`,
    [id,user.district_code,user.role !== 'ASHA',user.user_id])).rows[0];
}
export async function detail(db: pg.PoolClient, user: Actor, id: string) {
  return (await db.query<{ intake: CreateCase['intake']; transcript: string | null }>(`SELECT intake,transcript FROM intake_cases
    WHERE case_id=$1 AND district_code=$2 AND assigned_asha_id=$3 AND expires_at>now()`, [id,user.district_code,user.user_id])).rows[0];
}
export async function update(db: pg.PoolClient, id: string, status: CaseMetadata['status'], ashaId: string | null, reason: CaseMetadata['handoff_reason']) {
  await db.query(`UPDATE intake_cases SET status=$2,assigned_asha_id=$3,handoff_reason=$4,version=version+1,updated_at=now() WHERE case_id=$1`, [id,status,ashaId,reason]);
}
export async function directory(db: pg.PoolClient, user: Actor) {
  const villages = (await db.query<{ village_id: string; name: string; asha_id: string | null }>(`SELECT v.village_id,v.name,a.asha_id FROM villages v
    LEFT JOIN village_worker_assignments a ON a.village_id=v.village_id WHERE v.district_code=$1 ORDER BY v.name`, [user.district_code])).rows;
  const workers = user.role === 'ASHA' ? [] : (await db.query<{ user_id: string; full_name: string }>("SELECT user_id,full_name FROM users WHERE district_code=$1 AND role='ASHA' AND is_active=true ORDER BY full_name,user_id", [user.district_code])).rows;
  return { canManage: user.role !== 'ASHA', villages, workers };
}
export async function events(db: pg.PoolClient, user: Actor, id: string) {
  return (await db.query(`SELECT event_id,actor_id,action,target_asha_id,created_at FROM worker_assignment_events
    WHERE case_id=$1 AND district_code=$2 AND expires_at>now() ORDER BY event_id DESC LIMIT 100`, [id,user.district_code])).rows;
}
export async function purgeExpired() {
  return transaction(async db => {
    const cases = await db.query('DELETE FROM intake_cases WHERE expires_at<=now()');
    const events = await db.query('DELETE FROM worker_assignment_events WHERE expires_at<=now()');
    return { cases: cases.rowCount, standaloneEvents: events.rowCount };
  });
}
