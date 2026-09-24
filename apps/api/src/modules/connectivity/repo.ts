import type pg from "pg";
import { query } from "../../db/pool.ts";
import { withTransaction } from "../../db/tx.ts";

export interface OperationRow{payload_hash:string;status:string;result:Record<string,unknown>}
export async function findOperation(id:string,actorType:string,actorId:string):Promise<OperationRow|null>{return(await query<OperationRow>(`SELECT payload_hash,status,result FROM connectivity_operations WHERE operation_id=$1 AND actor_type=$2 AND actor_id=$3`,[id,actorType,actorId]))[0]??null;}
export async function recordProviderOperation(input:{id:string;actorId:string;facilityId:string;type:string;hash:string;result:unknown}):Promise<void>{await query(`INSERT INTO connectivity_operations(operation_id,actor_type,actor_id,facility_id,operation_type,payload_hash,status,result) VALUES($1,'PROVIDER',$2,$3,$4,$5,'APPLIED',$6) ON CONFLICT(operation_id) DO NOTHING`,[input.id,input.actorId,input.facilityId,input.type,input.hash,input.result]);}

export async function applyPatientOperation(input:{id:string;patientId:string;type:string;hash:string;payload:Record<string,unknown>}):Promise<{duplicate:boolean;serverId?:string}>{
 return withTransaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[input.id]);const prior=(await client.query<OperationRow>(`SELECT payload_hash,status,result FROM connectivity_operations WHERE operation_id=$1 AND actor_type='PATIENT' AND actor_id=$2`,[input.id,input.patientId])).rows[0];
  if(prior){if(prior.payload_hash!==input.hash)throw Object.assign(new Error("Operation id was reused with different content."),{code:"23505"});return{duplicate:true,serverId:typeof prior.result["serverId"]==="string"?prior.result["serverId"]:undefined};}
  let serverId:string|undefined;
  if(input.type==="CONSENT_DECIDE")serverId=await decideConsent(client,input.patientId,input.payload);
  else if(input.type==="CONSENT_REVOKE")serverId=await revokeConsent(client,input.patientId,String(input.payload["consentRequestId"]));
  else if(input.type==="CARE_CONTEXT_LINK")serverId=await linkContext(client,input.patientId,String(input.payload["careContextId"]));
  else throw Object.assign(new Error("Unknown patient operation."),{code:"23514"});
  await client.query(`INSERT INTO connectivity_operations(operation_id,actor_type,actor_id,operation_type,payload_hash,status,result) VALUES($1,'PATIENT',$2,$3,$4,'APPLIED',$5)`,[input.id,input.patientId,input.type,input.hash,{serverId}]);return{duplicate:false,serverId};});
}
async function decideConsent(client:pg.PoolClient,patientId:string,payload:Record<string,unknown>):Promise<string>{const id=String(payload["consentRequestId"]),decision=String(payload["decision"]),types=Array.isArray(payload["approvedHiTypes"])?payload["approvedHiTypes"].map(String):[];
 const locked=(await client.query<{requested_hi_types:string[];status:string;valid_until:Date;date_from:Date;date_to:Date;requesting_facility_id:string}>(`SELECT requested_hi_types,status,valid_until,date_from,date_to,requesting_facility_id FROM abdm_consent_requests WHERE consent_request_id=$1 AND patient_id=$2 FOR UPDATE`,[id,patientId])).rows[0];
 if(!locked||locked.status!=="REQUESTED")throw Object.assign(new Error("Consent request is no longer pending."),{code:"23514"});if(decision==="APPROVE"&&types.some(type=>!locked.requested_hi_types.includes(type)))throw Object.assign(new Error("Approved types exceed the request."),{code:"23514"});
 const status=decision==="APPROVE"?"GRANTED":"DENIED";await client.query(`UPDATE abdm_consent_requests SET status=$3,decided_at=now() WHERE consent_request_id=$1 AND patient_id=$2`,[id,patientId,status]);
 if(status==="GRANTED")await client.query(`INSERT INTO abdm_consent_grants(consent_request_id,patient_id,hiu_facility_id,approved_hi_types,date_from,date_to,valid_from,valid_until) VALUES($1,$2,$3,$4,$5,$6,now(),$7)`,[id,patientId,locked.requesting_facility_id,types,locked.date_from,locked.date_to,locked.valid_until]);
 await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id,detail) VALUES($1,$2,'PATIENT',$3,$4)`,[id,status,patientId,{approvedHiTypes:types,offlineOperation:true}]);return id;}
async function revokeConsent(client:pg.PoolClient,patientId:string,id:string):Promise<string>{const updated=await client.query(`UPDATE abdm_consent_requests SET status='REVOKED',decided_at=now() WHERE consent_request_id=$1 AND patient_id=$2 AND status='GRANTED'`,[id,patientId]);if(updated.rowCount!==1)throw Object.assign(new Error("Only an active grant can be revoked."),{code:"23514"});await client.query(`UPDATE abdm_consent_grants SET status='REVOKED',revoked_at=now() WHERE consent_request_id=$1`,[id]);await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id,detail) VALUES($1,'REVOKED','PATIENT',$2,$3)`,[id,patientId,{offlineOperation:true}]);return id;}
async function linkContext(client:pg.PoolClient,patientId:string,id:string):Promise<string>{const updated=await client.query(`UPDATE abdm_care_contexts SET link_status='LINKED',linked_at=now() WHERE care_context_id=$1 AND patient_id=$2 AND link_status<>'LINKED'`,[id,patientId]);if(updated.rowCount!==1)throw Object.assign(new Error("Care context not found or already linked."),{code:"23514"});return id;}

