/** STATUS: Implemented — replay-safe IVR persistence; no raw webhook bodies. */
import type pg from 'pg';
import type { IvrProviderResponse } from '@swasthyasetu/contracts/ivr';

export type IvrState = 'LANGUAGE'|'CONSENT'|'RELATIONSHIP'|'VILLAGE'|'CATEGORY'|'DURATION'|'CALLBACK_CHOICE'|'CALLBACK_NUMBER'|'CONFIRM'|'COMPLETED'|'FAILED'|'HUNG_UP';
export interface IvrCall {
  call_id: string;
  provider: string;
  provider_call_id: string;
  caller_phone: string | null;
  state: IvrState;
  language: 'hi'|'en'|null;
  responses: Record<string,string>;
  invalid_attempts: number;
  timeout_attempts: number;
  consent_version: string|null;
  consent_at: string|null;
  case_id: string|null;
  terminal_reason: string|null;
  expires_at: string;
}
export interface VillageRoute { village_id: string; district_code: string; name: string }

export async function lockEvent(db: pg.PoolClient, provider: string, eventId: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[provider,eventId]);
}

export async function priorEvent(db: pg.PoolClient, provider: string, eventId: string) {
  return (await db.query<{ response: IvrProviderResponse }>(
    'SELECT response FROM ivr_provider_events WHERE provider=$1 AND provider_event_id=$2',
    [provider,eventId],
  )).rows[0]?.response;
}

export async function startCall(db: pg.PoolClient, id: string, provider: string, providerCallId: string, callerPhone: string, expires: Date) {
  await db.query(`INSERT INTO ivr_calls(call_id,provider,provider_call_id,caller_phone,state,expires_at)
    VALUES($1,$2,$3,$4,'LANGUAGE',$5) ON CONFLICT(provider,provider_call_id) DO NOTHING`,
    [id,provider,providerCallId,callerPhone,expires]);
  return (await db.query<IvrCall>('SELECT * FROM ivr_calls WHERE provider=$1 AND provider_call_id=$2 FOR UPDATE',[provider,providerCallId])).rows[0];
}

export async function lockCall(db: pg.PoolClient, provider: string, providerCallId: string) {
  return (await db.query<IvrCall>('SELECT * FROM ivr_calls WHERE provider=$1 AND provider_call_id=$2 AND expires_at>now() FOR UPDATE',[provider,providerCallId])).rows[0];
}

export async function villageRoute(db: pg.PoolClient, dialCode: string) {
  return (await db.query<VillageRoute>(`SELECT v.village_id,v.district_code,v.name FROM ivr_village_routes r
    JOIN villages v ON v.village_id=r.village_id WHERE r.dial_code=$1 AND r.is_active=true`,[dialCode])).rows[0];
}

export async function saveCall(db: pg.PoolClient, call: IvrCall) {
  await db.query(`UPDATE ivr_calls SET state=$2,language=$3,responses=$4,invalid_attempts=$5,timeout_attempts=$6,
    consent_version=$7,consent_at=$8,case_id=$9,terminal_reason=$10,updated_at=now() WHERE call_id=$1`,
    [call.call_id,call.state,call.language,call.responses,call.invalid_attempts,call.timeout_attempts,
      call.consent_version,call.consent_at,call.case_id,call.terminal_reason]);
}

export async function saveEvent(db: pg.PoolClient, provider: string, eventId: string, call: IvrCall, eventType: string, response: IvrProviderResponse) {
  await db.query(`INSERT INTO ivr_provider_events(provider,provider_event_id,call_id,event_type,response,expires_at)
    VALUES($1,$2,$3,$4,$5,$6)`,[provider,eventId,call.call_id,eventType,response,call.expires_at]);
}

export async function purgeExpired(db: pg.PoolClient) {
  const events = await db.query('DELETE FROM ivr_provider_events WHERE expires_at<=now()');
  const calls = await db.query('DELETE FROM ivr_calls WHERE expires_at<=now()');
  return { calls: calls.rowCount, events: events.rowCount };
}
