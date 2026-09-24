import type pg from "pg";
import { query } from "../../db/pool.ts";
import { withTransaction } from "../../db/tx.ts";

export interface ReferralRow { referral_id:string;patient_id:string;origin_facility_id:string;receiving_facility_id:string;referring_practitioner_id:string;consent_grant_id:string|null;reason:string;priority:string;requested_service:string;status:string;expected_arrival_at:Date|null;scheduled_at:Date|null;outcome:string|null;follow_up:string|null;created_at:Date;updated_at:Date }
const SELECT=`SELECT referral_id,patient_id,origin_facility_id,receiving_facility_id,referring_practitioner_id,
 consent_grant_id,reason,priority,requested_service,status,expected_arrival_at,scheduled_at,outcome,follow_up,created_at,updated_at FROM abdm_referrals`;

export async function insertReferral(input:{referralId:string;operationId:string;accountId:string;patientId:string;originFacilityId:string;receivingFacilityId:string;practitionerId:string;reason:string;priority:string;service:string;expected?:string;payloadHash:string;consent:{types:string[];dateFrom:string;dateTo:string;validUntil:string;explanation:unknown}}):Promise<ReferralRow>{
 return withTransaction(async client=>{
  const prior=(await client.query<{payload_hash:string;result:Record<string,unknown>}>(`SELECT payload_hash,result FROM abdm_provider_operations WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0];
  if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(String(prior.result["referralId"]),client);}
  const row=(await client.query<{referral_id:string}>(`INSERT INTO abdm_referrals
   (referral_id,patient_id,origin_facility_id,receiving_facility_id,referring_practitioner_id,reason,priority,requested_service,expected_arrival_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING referral_id`,[input.referralId,input.patientId,input.originFacilityId,input.receivingFacilityId,input.practitionerId,input.reason,input.priority,input.service,input.expected??null])).rows[0];
  if(!row)throw new Error("Referral insert failed.");
  const consent=(await client.query<{consent_request_id:string}>(`INSERT INTO abdm_consent_requests
   (patient_id,requesting_facility_id,requesting_practitioner_id,purpose,requested_hi_types,date_from,date_to,valid_until,referral_id,explanation)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING consent_request_id`,[input.patientId,input.receivingFacilityId,input.practitionerId,
   `Referral to ${input.service}: ${input.reason}`,input.consent.types,input.consent.dateFrom,input.consent.dateTo,input.consent.validUntil,input.referralId,input.consent.explanation])).rows[0];
  if(!consent)throw new Error("Referral consent insert failed.");
  await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id) VALUES($1,'REQUESTED','PROVIDER',$2)`,[consent.consent_request_id,input.practitionerId]);
  await client.query(`INSERT INTO abdm_referral_events(referral_id,actor_practitioner_id,to_status) VALUES($1,$2,'CREATED')`,[row.referral_id,input.practitionerId]);
  await client.query(`INSERT INTO abdm_provider_operations(operation_id,provider_account_id,operation_type,payload_hash,result) VALUES($1,$2,'CREATE_REFERRAL',$3,$4)`,[input.operationId,input.accountId,input.payloadHash,{referralId:row.referral_id}]);
  return byId(row.referral_id,client);
 });
}
async function byId(id:string,client?:pg.PoolClient):Promise<ReferralRow>{const result=client?await client.query<ReferralRow>(`${SELECT} WHERE referral_id=$1`,[id]):{rows:await query<ReferralRow>(`${SELECT} WHERE referral_id=$1`,[id])};const row=result.rows[0];if(!row)throw new Error("Referral disappeared.");return row;}
export async function findReferral(id:string):Promise<ReferralRow|null>{return(await query<ReferralRow>(`${SELECT} WHERE referral_id=$1`,[id]))[0]??null;}
export async function findOperation(operationId:string):Promise<{payload_hash:string;result:Record<string,unknown>}|null>{return(await query<{payload_hash:string;result:Record<string,unknown>}>(`SELECT payload_hash,result FROM abdm_provider_operations WHERE operation_id=$1`,[operationId]))[0]??null;}
export async function listForFacility(facilityId:string):Promise<ReferralRow[]>{return query<ReferralRow>(`${SELECT} WHERE origin_facility_id=$1 OR receiving_facility_id=$1 ORDER BY updated_at DESC`,[facilityId]);}
export async function listForPatient(patientId:string):Promise<ReferralRow[]>{return query<ReferralRow>(`${SELECT} WHERE patient_id=$1 ORDER BY updated_at DESC`,[patientId]);}
export async function attachActiveReferralGrant(referralId:string,facilityId:string):Promise<string|null>{
 const rows=await query<{consent_grant_id:string}>(`UPDATE abdm_referrals r SET consent_grant_id=g.consent_grant_id
  FROM abdm_consent_requests q JOIN abdm_consent_grants g USING(consent_request_id)
  WHERE r.referral_id=$1 AND r.receiving_facility_id=$2 AND q.referral_id=r.referral_id
    AND g.hiu_facility_id=$2 AND g.status='GRANTED' AND g.valid_from<=now() AND g.valid_until>now()
  RETURNING g.consent_grant_id`,[referralId,facilityId]);return rows[0]?.consent_grant_id??null;
}
export async function transition(id:string,practitionerId:string,accountId:string,operationId:string,payloadHash:string,from:string,to:string,input:{scheduledAt?:string;outcome?:string;followUp?:string}):Promise<ReferralRow|null>{
 return withTransaction(async client=>{const prior=(await client.query<{payload_hash:string;result:Record<string,unknown>}>(`SELECT payload_hash,result FROM abdm_provider_operations WHERE operation_id=$1 FOR UPDATE`,[operationId])).rows[0];
  if(prior){if(prior.payload_hash!==payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(String(prior.result["referralId"]),client);}
  const updated=await client.query(`UPDATE abdm_referrals SET status=$3,
  scheduled_at=COALESCE($4,scheduled_at),outcome=COALESCE($5,outcome),follow_up=COALESCE($6,follow_up)
  WHERE referral_id=$1 AND status=$2`,[id,from,to,input.scheduledAt??null,input.outcome??null,input.followUp??null]);if(updated.rowCount!==1)return null;
  await client.query(`INSERT INTO abdm_referral_events(referral_id,actor_practitioner_id,from_status,to_status,detail) VALUES($1,$2,$3,$4,$5)`,[id,practitionerId,from,to,input]);
  await client.query(`INSERT INTO abdm_provider_operations(operation_id,provider_account_id,operation_type,payload_hash,result) VALUES($1,$2,'TRANSITION_REFERRAL',$3,$4)`,[operationId,accountId,payloadHash,{referralId:id,status:to}]);return byId(id,client);});
}
