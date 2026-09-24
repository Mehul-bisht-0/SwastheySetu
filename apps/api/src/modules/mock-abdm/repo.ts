import type pg from "pg";
import { query } from "../../db/pool.ts";
import { withTransaction } from "../../db/tx.ts";

export interface RegistryFacilityRow { facility_id:string; hfr_id:string; name:string; facility_type:string; district_code:string }
export interface RegistryPractitionerRow { practitioner_id:string; hpr_id:string; full_name:string; qualification:string; specialty:string; facility_id:string; facility_name:string; role:string }
export interface PatientLookupRow { patient_id:string; identifier_masked:string; full_name:string }
export interface ConsentRow {
  consent_request_id:string; patient_id:string; facility_id:string; facility_name:string; hfr_id:string;
  practitioner_id:string; practitioner_name:string; hpr_id:string; purpose:string; requested_hi_types:string[];
  approved_hi_types:string[]|null; date_from:Date; date_to:Date; valid_from:Date|null; valid_until:Date;
  status:string; referral_id:string|null; explanation:unknown; created_at:Date; consent_grant_id:string|null;
}
export interface RecordRow {
  record_id:string; patient_id:string; care_context_id:string; record_type:string; title:string; authored_at:Date;
  facility_id:string; facility_name:string; hfr_id:string; author_name:string; profile_url:string; fhir_version:string;
  summary:Record<string,unknown>; fhir_bundle:Record<string,unknown>;
}
export interface CareContextRow { care_context_id:string; display:string; link_status:string; facility_id:string; facility_name:string; hfr_id:string; created_at:Date }
export interface AccessAuditRow { access_event_id:string; practitioner_name:string; facility_name:string; purpose:string; action:string; record_ids:string[]; occurred_at:Date }

export async function registryFacilities(): Promise<RegistryFacilityRow[]> {
  return query(`SELECT facility_id,external_abdm_id AS hfr_id,name,facility_type,district_code
    FROM facilities WHERE external_abdm_id IS NOT NULL ORDER BY name`);
}
export async function registryPractitioners(): Promise<RegistryPractitionerRow[]> {
  return query(`SELECT p.practitioner_id,p.hpr_id,p.full_name,p.qualification,p.specialty,
    f.facility_id,f.name AS facility_name,pf.role FROM practitioners p
    JOIN practitioner_facilities pf USING(practitioner_id) JOIN facilities f USING(facility_id)
    WHERE p.is_active=true AND pf.is_active=true ORDER BY p.full_name,f.name`);
}
export async function patientByIdentifierHash(hash:string): Promise<PatientLookupRow|null> {
  return (await query<PatientLookupRow>(`SELECT a.patient_id,a.identifier_masked,p.full_name
    FROM mock_abha_profiles a JOIN patients p USING(patient_id)
    WHERE a.identifier_hash=$1 AND a.status='ACTIVE' AND p.is_active=true`,[hash]))[0] ?? null;
}
export async function patientExists(patientId:string): Promise<boolean> {
  return (await query(`SELECT 1 FROM patients p JOIN mock_abha_profiles a USING(patient_id)
    WHERE p.patient_id=$1 AND p.is_active=true AND a.status='ACTIVE'`,[patientId])).length>0;
}
export async function hasDiagnosticAssignment(referralId:string,patientId:string,facilityId:string):Promise<boolean>{
  return(await query(`SELECT 1 FROM abdm_referrals WHERE referral_id=$1 AND patient_id=$2
    AND receiving_facility_id=$3 AND status IN ('ACCEPTED','SCHEDULED','ARRIVED')`,[referralId,patientId,facilityId])).length===1;
}

const CONSENT_SELECT = `SELECT r.consent_request_id,r.patient_id,f.facility_id,f.name AS facility_name,
 f.external_abdm_id AS hfr_id,p.practitioner_id,p.full_name AS practitioner_name,p.hpr_id,
 r.purpose,r.requested_hi_types,g.approved_hi_types,r.date_from,r.date_to,g.valid_from,r.valid_until,
 CASE WHEN r.status='GRANTED' AND r.valid_until<=now() THEN 'EXPIRED' ELSE r.status END AS status,
 r.referral_id,r.explanation,r.created_at,g.consent_grant_id
 FROM abdm_consent_requests r JOIN facilities f ON f.facility_id=r.requesting_facility_id
 JOIN practitioners p ON p.practitioner_id=r.requesting_practitioner_id
 LEFT JOIN abdm_consent_grants g USING(consent_request_id)`;

export async function createConsent(input:{patientId:string;facilityId:string;practitionerId:string;purpose:string;types:string[];dateFrom:string;dateTo:string;validUntil:string;referralId?:string;explanation:unknown}):Promise<ConsentRow>{
  return withTransaction(async client=>{
    const row=(await client.query<{consent_request_id:string}>(`INSERT INTO abdm_consent_requests
      (patient_id,requesting_facility_id,requesting_practitioner_id,purpose,requested_hi_types,date_from,date_to,valid_until,referral_id,explanation)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING consent_request_id`,
      [input.patientId,input.facilityId,input.practitionerId,input.purpose,input.types,input.dateFrom,input.dateTo,input.validUntil,input.referralId??null,input.explanation])).rows[0];
    if(!row) throw new Error("Consent request insert failed.");
    await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id)
      VALUES($1,'REQUESTED','PROVIDER',$2)`,[row.consent_request_id,input.practitionerId]);
    return consentById(row.consent_request_id,client);
  });
}
async function consentById(id:string,client?:pg.PoolClient):Promise<ConsentRow>{
  const result=client ? await client.query<ConsentRow>(`${CONSENT_SELECT} WHERE r.consent_request_id=$1`,[id])
    : { rows: await query<ConsentRow>(`${CONSENT_SELECT} WHERE r.consent_request_id=$1`,[id]) };
  const row=result.rows[0]; if(!row) throw new Error("Consent request disappeared."); return row;
}
export async function findConsent(id:string):Promise<ConsentRow|null>{
  return (await query<ConsentRow>(`${CONSENT_SELECT} WHERE r.consent_request_id=$1`,[id]))[0]??null;
}
export async function patientConsents(patientId:string):Promise<ConsentRow[]>{
  return query<ConsentRow>(`${CONSENT_SELECT} WHERE r.patient_id=$1 ORDER BY r.created_at DESC`,[patientId]);
}
export async function providerConsents(facilityId:string):Promise<ConsentRow[]>{
  return query<ConsentRow>(`${CONSENT_SELECT} WHERE r.requesting_facility_id=$1 ORDER BY r.created_at DESC`,[facilityId]);
}
export async function decideConsent(id:string,patientId:string,approve:boolean,types:string[]):Promise<ConsentRow|null>{
  return withTransaction(async client=>{
    const locked=(await client.query<{requested_hi_types:string[];status:string;valid_until:Date;date_from:Date;date_to:Date;requesting_facility_id:string}>(
      `SELECT requested_hi_types,status,valid_until,date_from,date_to,requesting_facility_id FROM abdm_consent_requests
       WHERE consent_request_id=$1 AND patient_id=$2 FOR UPDATE`,[id,patientId])).rows[0];
    if(!locked||locked.status!=="REQUESTED") return null;
    const status=approve?"GRANTED":"DENIED";
    await client.query(`UPDATE abdm_consent_requests SET status=$3,decided_at=now() WHERE consent_request_id=$1 AND patient_id=$2`,[id,patientId,status]);
    if(approve) await client.query(`INSERT INTO abdm_consent_grants
      (consent_request_id,patient_id,hiu_facility_id,approved_hi_types,date_from,date_to,valid_from,valid_until)
      VALUES($1,$2,$3,$4,$5,$6,now(),$7)`,[id,patientId,locked.requesting_facility_id,types,locked.date_from,locked.date_to,locked.valid_until]);
    await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id,detail)
      VALUES($1,$2,'PATIENT',$3,$4)`,[id,status,patientId,{approvedHiTypes:types}]);
    return consentById(id,client);
  });
}
export async function revokeConsent(id:string,patientId:string):Promise<ConsentRow|null>{
  return withTransaction(async client=>{
    const updated=await client.query(`UPDATE abdm_consent_requests SET status='REVOKED',decided_at=now()
      WHERE consent_request_id=$1 AND patient_id=$2 AND status='GRANTED'`,[id,patientId]);
    if(updated.rowCount!==1) return null;
    await client.query(`UPDATE abdm_consent_grants SET status='REVOKED',revoked_at=now() WHERE consent_request_id=$1`,[id]);
    await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id)
      VALUES($1,'REVOKED','PATIENT',$2)`,[id,patientId]);
    return consentById(id,client);
  });
}

export interface GrantRow { consent_grant_id:string;patient_id:string;hiu_facility_id:string;purpose:string;approved_hi_types:string[];date_from:Date;date_to:Date;valid_until:Date }
export async function activeGrant(grantId:string,patientId:string,facilityId:string):Promise<GrantRow|null>{
  return (await query<GrantRow>(`SELECT g.consent_grant_id,g.patient_id,g.hiu_facility_id,r.purpose,g.approved_hi_types,g.date_from,g.date_to,g.valid_until
    FROM abdm_consent_grants g JOIN abdm_consent_requests r USING(consent_request_id)
    WHERE g.consent_grant_id=$1 AND g.patient_id=$2 AND g.hiu_facility_id=$3
      AND g.status='GRANTED' AND g.valid_from<=now() AND g.valid_until>now()`,[grantId,patientId,facilityId]))[0]??null;
}

const RECORD_SELECT=`SELECT r.record_id,r.patient_id,r.care_context_id,r.record_type,r.title,r.authored_at,
 f.facility_id,f.name AS facility_name,f.external_abdm_id AS hfr_id,p.full_name AS author_name,
 r.profile_url,r.fhir_version,r.summary,r.fhir_bundle FROM abdm_health_records r
 JOIN facilities f ON f.facility_id=r.hip_facility_id JOIN practitioners p ON p.practitioner_id=r.author_practitioner_id`;
export async function recordsForGrant(grant:GrantRow):Promise<RecordRow[]>{
  return query<RecordRow>(`${RECORD_SELECT} JOIN abdm_care_contexts c ON c.care_context_id=r.care_context_id
    WHERE r.patient_id=$1 AND r.status='PUBLISHED' AND c.link_status='LINKED'
      AND r.record_type=ANY($2::text[]) AND r.authored_at BETWEEN $3 AND $4
    ORDER BY r.authored_at DESC,r.record_id`,[grant.patient_id,grant.approved_hi_types,grant.date_from,grant.date_to]);
}
export async function patientRecords(patientId:string):Promise<RecordRow[]>{
  return query<RecordRow>(`${RECORD_SELECT} JOIN abdm_care_contexts c ON c.care_context_id=r.care_context_id
    WHERE r.patient_id=$1 AND r.status='PUBLISHED' AND c.link_status='LINKED' ORDER BY r.authored_at DESC,r.record_id`,[patientId]);
}
export async function patientContexts(patientId:string):Promise<CareContextRow[]>{
  return query<CareContextRow>(`SELECT c.care_context_id,c.display,c.link_status,f.facility_id,f.name AS facility_name,
    f.external_abdm_id AS hfr_id,c.created_at FROM abdm_care_contexts c JOIN facilities f ON f.facility_id=c.hip_facility_id
    WHERE c.patient_id=$1 ORDER BY c.created_at DESC`,[patientId]);
}
export async function linkContext(contextId:string,patientId:string):Promise<boolean>{
  const rows=await query(`UPDATE abdm_care_contexts SET link_status='LINKED',linked_at=now()
    WHERE care_context_id=$1 AND patient_id=$2 AND link_status<>'LINKED' RETURNING care_context_id`,[contextId,patientId]); return rows.length===1;
}
export async function createCareContext(patientId:string,facilityId:string,reference:string,display:string):Promise<CareContextRow>{
  const rows=await query<CareContextRow>(`WITH inserted AS (
    INSERT INTO abdm_care_contexts(patient_id,hip_facility_id,context_reference,display)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(hip_facility_id,context_reference) DO UPDATE SET display=EXCLUDED.display
    RETURNING care_context_id,display,link_status,hip_facility_id,created_at)
    SELECT i.care_context_id,i.display,i.link_status,f.facility_id,f.name AS facility_name,
      f.external_abdm_id AS hfr_id,i.created_at FROM inserted i JOIN facilities f ON f.facility_id=i.hip_facility_id`,
    [patientId,facilityId,reference,display]);
  const row=rows[0];if(!row)throw new Error("Care context insert failed.");return row;
}
export async function auditAccess(input:{patientId:string;practitionerId:string;facilityId:string;grantId:string;purpose:string;action:string;recordIds:string[]}):Promise<void>{
  await query(`INSERT INTO abdm_record_access_audit(patient_id,practitioner_id,facility_id,consent_grant_id,purpose,action,record_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.patientId,input.practitionerId,input.facilityId,input.grantId,input.purpose,input.action,input.recordIds]);
}
export async function patientAudit(patientId:string):Promise<AccessAuditRow[]>{
  return query<AccessAuditRow>(`SELECT a.access_event_id,p.full_name AS practitioner_name,f.name AS facility_name,
    a.purpose,a.action,a.record_ids,a.occurred_at FROM abdm_record_access_audit a
    JOIN practitioners p USING(practitioner_id) JOIN facilities f USING(facility_id)
    WHERE a.patient_id=$1 ORDER BY a.occurred_at DESC`,[patientId]);
}
export async function findRecordOperation(operationId:string):Promise<{payload_hash:string;record:RecordRow}|null>{
  const operation=(await query<{payload_hash:string;result:Record<string,unknown>}>(`SELECT payload_hash,result FROM abdm_provider_operations WHERE operation_id=$1`,[operationId]))[0];
  if(!operation)return null;
  const record=await recordById(String(operation.result["recordId"]));
  return{payload_hash:operation.payload_hash,record};
}
export async function insertRecord(input:{operationId:string;accountId:string;patientId:string;careContextId:string;facilityId:string;practitionerId:string;recordType:string;title:string;authoredAt:string;profileUrl:string;bundle:unknown;summary:unknown;checksum:string;payloadHash:string}):Promise<RecordRow>{
  return withTransaction(async client=>{
    const existing=(await client.query<{result:Record<string,unknown>;payload_hash:string}>(`SELECT result,payload_hash FROM abdm_provider_operations WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0];
    if(existing){ if(existing.payload_hash!==input.payloadHash) throw Object.assign(new Error("Operation id was reused with different content."),{code:"23505"}); return recordById(String(existing.result["recordId"]),client); }
    const context=(await client.query<{patient_id:string;hip_facility_id:string}>(`SELECT patient_id,hip_facility_id FROM abdm_care_contexts WHERE care_context_id=$1`,[input.careContextId])).rows[0];
    if(!context||context.patient_id!==input.patientId||context.hip_facility_id!==input.facilityId) throw Object.assign(new Error("Care context does not belong to this facility and patient."),{code:"23503"});
    const id=(await client.query<{record_id:string}>(`INSERT INTO abdm_health_records
      (patient_id,care_context_id,hip_facility_id,author_practitioner_id,record_type,title,authored_at,profile_url,fhir_bundle,summary,checksum)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING record_id`,
      [input.patientId,input.careContextId,input.facilityId,input.practitionerId,input.recordType,input.title,input.authoredAt,input.profileUrl,input.bundle,input.summary,input.checksum])).rows[0];
    if(!id) throw new Error("Record insert failed.");
    await client.query(`INSERT INTO abdm_provider_operations(operation_id,provider_account_id,operation_type,payload_hash,result)
      VALUES($1,$2,'PUBLISH_RECORD',$3,$4)`,[input.operationId,input.accountId,input.payloadHash,{recordId:id.record_id}]);
    return recordById(id.record_id,client);
  });
}
async function recordById(id:string,client?:pg.PoolClient):Promise<RecordRow>{
  const result=client?await client.query<RecordRow>(`${RECORD_SELECT} WHERE r.record_id=$1`,[id]):{rows:await query<RecordRow>(`${RECORD_SELECT} WHERE r.record_id=$1`,[id])};
  const row=result.rows[0]; if(!row) throw new Error("Record disappeared."); return row;
}
export async function createPacket(input:{patientId:string;grantId:string;facilityId:string;practitionerId:string;recordIds:string[];manifest:unknown;signature:string;expiresAt:Date}):Promise<{packet_id:string;created_at:Date}>{
  const rows=await query<{packet_id:string;created_at:Date}>(`INSERT INTO abdm_care_packets
    (patient_id,consent_grant_id,facility_id,practitioner_id,record_ids,manifest,signature,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING packet_id,created_at`,
    [input.patientId,input.grantId,input.facilityId,input.practitionerId,input.recordIds,input.manifest,input.signature,input.expiresAt]);
  const row=rows[0];if(!row)throw new Error("Care packet insert failed.");return row;
}
