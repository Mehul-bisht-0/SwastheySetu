import { randomUUID } from "node:crypto";
import type pg from "pg";
import { query } from "../../db/pool.ts";
import { withTransaction } from "../../db/tx.ts";

export interface ServiceRow {
  service_id:string;test_id:string;code_system:string;code:string;display:string;kind:string;specimen_type:string|null;preparation:Record<string,string>;
  facility_id:string;facility_name:string;district_code:string;latitude:number;longitude:number;phone:string|null;collection_supported:boolean;
  processing_model:string;processing_facility_id:string|null;appointment_required:boolean;turnaround_minutes_min:number;turnaround_minutes_max:number;
  indicative_cost_paisa_min:number|null;indicative_cost_paisa_max:number|null;supported_schemes:string[];last_positive_at:Date|null;last_negative_at:Date|null;
  latest_evidence_at:Date|null;latest_evidence_type:string|null;latest_reporter:string|null;updated_at:Date;distance_meters?:number;
}
export interface OrderRow {
  order_id:string;tracking_code:string;patient_id:string;service_id:string;origin_facility_id:string;destination_facility_id:string;destination_facility_name:string;
  ordering_practitioner_id:string;consent_request_id:string|null;consent_grant_id:string|null;priority:string;practitioner_reason:string;service_request:Record<string,unknown>;
  status:string;requested_window_start:Date|null;requested_window_end:Date|null;scheduled_at:Date|null;expected_by:Date|null;result_record_id:string|null;
  specimen_id:string|null;specimen_status:string|null;test_id:string;code_system:string;code:string;display:string;kind:string;specimen_type:string|null;
  preparation:Record<string,string>;consent_status:string;can_view_clinical:boolean;created_at:Date;updated_at:Date;
}

const SERVICE_SELECT=`SELECT s.service_id,t.test_id,t.code_system,t.code,t.display,t.kind,t.specimen_type,t.preparation,
 f.facility_id,f.name AS facility_name,f.district_code,f.latitude,f.longitude,f.phone,s.collection_supported,s.processing_model,
 s.processing_facility_id,s.appointment_required,s.turnaround_minutes_min,s.turnaround_minutes_max,s.indicative_cost_paisa_min,
 s.indicative_cost_paisa_max,s.supported_schemes,GREATEST(s.updated_at,t.updated_at,COALESCE(ev.latest_evidence_at,'epoch'::timestamptz)) AS updated_at,
 ev.last_positive_at,ev.last_negative_at,ev.latest_evidence_at,latest.evidence_type AS latest_evidence_type,latest.reporter AS latest_reporter`;
const SERVICE_FROM=` FROM facility_diagnostic_services s JOIN diagnostic_tests t USING(test_id) JOIN facilities f USING(facility_id)
 LEFT JOIN LATERAL (SELECT max(observed_at) FILTER(WHERE evidence_type IN ('COLLECTION_CONFIRMED','PROCESSING_CONFIRMED','REAGENT_CONFIRMED')) AS last_positive_at,
 max(observed_at) FILTER(WHERE evidence_type IN ('STOCK_OUT_REPORTED','MACHINE_DOWN_REPORTED','COLLECTION_PAUSED_REPORTED')) AS last_negative_at,max(observed_at) AS latest_evidence_at
 FROM diagnostic_service_events WHERE service_id=s.service_id) ev ON true
 LEFT JOIN LATERAL (SELECT e.evidence_type,COALESCE(p.full_name,u.full_name,'Facility worker') AS reporter FROM diagnostic_service_events e
 LEFT JOIN practitioners p ON p.practitioner_id=e.provider_practitioner_id LEFT JOIN users u ON u.user_id=e.worker_user_id
 WHERE e.service_id=s.service_id ORDER BY e.observed_at DESC,e.received_at DESC LIMIT 1) latest ON true`;

export async function referenceServices(district:string,since:string|null,after:string|null,limit:number):Promise<ServiceRow[]>{
 return query<ServiceRow>(`${SERVICE_SELECT}${SERVICE_FROM} WHERE f.district_code=$1 AND s.is_active=true AND t.is_active=true
  AND ($2::timestamptz IS NULL OR GREATEST(s.updated_at,t.updated_at,COALESCE(ev.latest_evidence_at,'epoch'::timestamptz))>=$2) AND ($3::uuid IS NULL OR s.service_id>$3)
  ORDER BY s.service_id LIMIT $4`,[district,since,after,limit]);
}
export async function searchServices(code:string,district:string,lat?:number,lon?:number):Promise<ServiceRow[]>{
 const distance=lat===undefined?"":`,round(ST_Distance(f.geom,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography))::int AS distance_meters`;
 const order=lat===undefined?"f.name":"distance_meters,f.name";
 const params=lat===undefined?[code,district]:[code,district,lon,lat];
 return query<ServiceRow>(`${SERVICE_SELECT}${distance}${SERVICE_FROM} WHERE upper(t.code)=upper($1) AND f.district_code=$2 AND s.is_active=true AND t.is_active=true ORDER BY ${order}`,params);
}
export async function serviceById(id:string):Promise<ServiceRow|null>{return(await query<ServiceRow>(`${SERVICE_SELECT}${SERVICE_FROM} WHERE s.service_id=$1 AND s.is_active=true`,[id]))[0]??null;}
export async function configureService(facilityId:string,input:{testId:string;collectionSupported:boolean;processingModel:string;processingFacilityId?:string|null;appointmentRequired:boolean;turnaroundMinutesMin:number;turnaroundMinutesMax:number;indicativeCostPaisaMin:number|null;indicativeCostPaisaMax:number|null;supportedSchemes:string[]}):Promise<ServiceRow>{
 const rows=await query<{service_id:string}>(`INSERT INTO facility_diagnostic_services(facility_id,test_id,collection_supported,processing_model,processing_facility_id,appointment_required,turnaround_minutes_min,turnaround_minutes_max,indicative_cost_paisa_min,indicative_cost_paisa_max,supported_schemes)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(facility_id,test_id) DO UPDATE SET collection_supported=EXCLUDED.collection_supported,
  processing_model=EXCLUDED.processing_model,processing_facility_id=EXCLUDED.processing_facility_id,appointment_required=EXCLUDED.appointment_required,
  turnaround_minutes_min=EXCLUDED.turnaround_minutes_min,turnaround_minutes_max=EXCLUDED.turnaround_minutes_max,indicative_cost_paisa_min=EXCLUDED.indicative_cost_paisa_min,
  indicative_cost_paisa_max=EXCLUDED.indicative_cost_paisa_max,supported_schemes=EXCLUDED.supported_schemes,is_active=true RETURNING service_id`,
  [facilityId,input.testId,input.collectionSupported,input.processingModel,input.processingModel==="HUB"?input.processingFacilityId??null:null,input.appointmentRequired,input.turnaroundMinutesMin,input.turnaroundMinutesMax,input.indicativeCostPaisaMin,input.indicativeCostPaisaMax,input.supportedSchemes]);
 const row=rows[0];if(!row)throw new Error("Diagnostic service upsert failed.");const service=await serviceById(row.service_id);if(!service)throw new Error("Diagnostic service disappeared.");return service;
}
export async function insertServiceEvidence(input:{eventId:string;serviceId:string;providerId?:string;workerId?:string;evidenceType:string;observedAt:string;note?:string}):Promise<boolean>{
 const rows=await query(`INSERT INTO diagnostic_service_events(service_event_id,service_id,evidence_type,observed_at,provider_practitioner_id,worker_user_id,note)
  VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(service_event_id) DO NOTHING RETURNING service_event_id`,[input.eventId,input.serviceId,input.evidenceType,input.observedAt,input.providerId??null,input.workerId??null,input.note??null]);return rows.length===1;
}

const ORDER_SELECT=`SELECT o.order_id,o.tracking_code,o.patient_id,o.service_id,o.origin_facility_id,o.destination_facility_id,f.name AS destination_facility_name,
 o.ordering_practitioner_id,o.consent_request_id,o.consent_grant_id,o.priority,o.practitioner_reason,o.service_request,o.status,o.requested_window_start,
 o.requested_window_end,o.scheduled_at,o.expected_by,o.result_record_id,sp.specimen_id,sp.status AS specimen_status,t.test_id,t.code_system,t.code,t.display,t.kind,
 t.specimen_type,t.preparation,CASE WHEN o.consent_request_id IS NULL THEN 'GRANTED' WHEN cr.status='GRANTED' AND cg.status='GRANTED' AND cg.valid_until>now() THEN 'GRANTED'
 WHEN cr.status='REQUESTED' THEN 'PENDING' ELSE cr.status END AS consent_status,
 (o.origin_facility_id=$2 OR o.origin_facility_id=o.destination_facility_id OR (cg.status='GRANTED' AND cg.valid_until>now())) AS can_view_clinical,
 o.created_at,o.updated_at FROM diagnostic_orders o JOIN facility_diagnostic_services s USING(service_id) JOIN diagnostic_tests t USING(test_id)
 JOIN facilities f ON f.facility_id=o.destination_facility_id LEFT JOIN diagnostic_specimens sp USING(order_id)
 LEFT JOIN abdm_consent_requests cr ON cr.consent_request_id=o.consent_request_id LEFT JOIN abdm_consent_grants cg ON cg.consent_request_id=cr.consent_request_id`;

async function operation(client:pg.PoolClient,id:string,actorType:string,actorId:string):Promise<{payload_hash:string;result:Record<string,unknown>}|null>{
 await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[id]);
 return(await client.query<{payload_hash:string;result:Record<string,unknown>}>(`SELECT payload_hash,result FROM connectivity_operations WHERE operation_id=$1 AND actor_type=$2 AND actor_id=$3`,[id,actorType,actorId])).rows[0]??null;
}
async function recordOperation(client:pg.PoolClient,input:{id:string;actorType:string;actorId:string;facilityId?:string;type:string;hash:string;result:unknown}):Promise<void>{
 await client.query(`INSERT INTO connectivity_operations(operation_id,actor_type,actor_id,facility_id,operation_type,payload_hash,status,result) VALUES($1,$2,$3,$4,$5,$6,'APPLIED',$7)`,[input.id,input.actorType,input.actorId,input.facilityId??null,input.type,input.hash,input.result]);
}
async function byId(client:pg.PoolClient,id:string,facilityId:string):Promise<OrderRow>{const row=(await client.query<OrderRow>(`${ORDER_SELECT} WHERE o.order_id=$1 AND (o.origin_facility_id=$2 OR o.destination_facility_id=$2)`,[id,facilityId])).rows[0];if(!row)throw new Error("Diagnostic order disappeared.");return row;}
export async function findOrder(id:string,facilityId:string):Promise<OrderRow|null>{return(await query<OrderRow>(`${ORDER_SELECT} WHERE o.order_id=$1 AND (o.origin_facility_id=$2 OR o.destination_facility_id=$2)`,[id,facilityId]))[0]??null;}
export async function listOrders(facilityId:string):Promise<OrderRow[]>{return query<OrderRow>(`${ORDER_SELECT} WHERE o.origin_facility_id=$2 OR o.destination_facility_id=$2 ORDER BY o.updated_at DESC`,["00000000-0000-0000-0000-000000000000",facilityId]);}
export async function patientOrders(patientId:string):Promise<OrderRow[]>{const rows=await query<OrderRow>(`${ORDER_SELECT} WHERE o.patient_id=$1 ORDER BY o.updated_at DESC`,[patientId,"00000000-0000-0000-0000-000000000000"]);return rows.map(row=>({...row,can_view_clinical:true}));}

export async function createOrder(input:{operationId:string;payloadHash:string;accountId:string;practitionerId:string;originFacilityId:string;patientId:string;service:ServiceRow;priority:string;reason:string;serviceRequest:unknown;windowStart?:string;windowEnd?:string;sharedTypes:string[];trackingCode:string}):Promise<OrderRow>{
 return withTransaction(async client=>{
  const prior=await operation(client,input.operationId,"PROVIDER",input.accountId);if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(client,String(prior.result["orderId"]),input.originFacilityId);}
  const orderId=randomUUID();let consentId:string|null=null;
  if(input.originFacilityId!==input.service.facility_id){
   const consent=(await client.query<{consent_request_id:string}>(`INSERT INTO abdm_consent_requests(patient_id,requesting_facility_id,requesting_practitioner_id,purpose,requested_hi_types,date_from,date_to,valid_until,explanation)
    VALUES($1,$2,$3,$4,$5,now()-interval '5 years',now(),now()+interval '7 days',$6) RETURNING consent_request_id`,[input.patientId,input.service.facility_id,input.practitionerId,
    `Diagnostic coordination: ${input.service.display}`,input.sharedTypes,{en:"Share the selected records with the diagnostic facility for this order.",hi:"इस जाँच आदेश के लिए चुने हुए रिकॉर्ड जाँच सुविधा से साझा करें।",mr:"या तपासणी आदेशासाठी निवडक नोंदी तपासणी सुविधेसोबत शेअर करा."}])).rows[0];
   if(!consent)throw new Error("Diagnostic consent request failed.");consentId=consent.consent_request_id;
   await client.query(`INSERT INTO abdm_consent_events(consent_request_id,event_type,actor_type,actor_id) VALUES($1,'REQUESTED','PROVIDER',$2)`,[consentId,input.practitionerId]);
  }
  await client.query(`INSERT INTO diagnostic_orders(order_id,tracking_code,patient_id,service_id,origin_facility_id,destination_facility_id,ordering_practitioner_id,consent_request_id,priority,practitioner_reason,service_request,requested_window_start,requested_window_end)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[orderId,input.trackingCode,input.patientId,input.service.service_id,input.originFacilityId,input.service.facility_id,input.practitionerId,consentId,input.priority,input.reason,input.serviceRequest,input.windowStart??null,input.windowEnd??null]);
  await client.query(`INSERT INTO diagnostic_order_items(order_id,service_id,service_request) VALUES($1,$2,$3)`,[orderId,input.service.service_id,input.serviceRequest]);
  if(input.service.kind==="LAB")await client.query(`INSERT INTO diagnostic_specimens(order_id,accession_code,specimen_type) VALUES($1,$2,$3)`,[orderId,`SP-${input.trackingCode.slice(1)}`,input.service.specimen_type??"Unspecified specimen"]);
  await client.query(`INSERT INTO diagnostic_order_events(order_id,to_status,actor_practitioner_id) VALUES($1,'CREATED',$2)`,[orderId,input.practitionerId]);
  await client.query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,facility_id,action) VALUES($1,$2,$3,'ORDER_CREATED')`,[orderId,input.practitionerId,input.originFacilityId]);
  await recordOperation(client,{id:input.operationId,actorType:"PROVIDER",actorId:input.accountId,facilityId:input.originFacilityId,type:"DIAGNOSTIC_ORDER_CREATE",hash:input.payloadHash,result:{orderId}});
  return byId(client,orderId,input.originFacilityId);
 });
}

export async function attachGrant(orderId:string,facilityId:string):Promise<string|null>{const rows=await query<{consent_grant_id:string}>(`UPDATE diagnostic_orders o SET consent_grant_id=g.consent_grant_id FROM abdm_consent_grants g
 JOIN abdm_consent_requests r ON r.consent_request_id=g.consent_request_id
 WHERE o.order_id=$1 AND o.destination_facility_id=$2 AND g.consent_request_id=o.consent_request_id
   AND r.status='GRANTED' AND g.status='GRANTED' AND g.valid_until>now() RETURNING g.consent_grant_id`,[orderId,facilityId]);return rows[0]?.consent_grant_id??null;}
export async function transitionOrder(input:{operationId:string;payloadHash:string;accountId:string;practitionerId:string;facilityId:string;orderId:string;from:string;to:string;scheduledAt?:string;note?:string}):Promise<OrderRow|null>{
 return withTransaction(async client=>{const prior=await operation(client,input.operationId,"PROVIDER",input.accountId);if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(client,String(prior.result["orderId"]),input.facilityId);}
  const updated=await client.query(`UPDATE diagnostic_orders o SET status=$3,scheduled_at=COALESCE($4,scheduled_at),expected_by=CASE WHEN $3 IN ('ACCEPTED','SCHEDULED') THEN COALESCE($4,now())+(s.turnaround_minutes_max||' minutes')::interval ELSE expected_by END
   FROM facility_diagnostic_services s WHERE o.service_id=s.service_id AND o.order_id=$1 AND o.status=$2`,[input.orderId,input.from,input.to,input.scheduledAt??null]);if(updated.rowCount!==1)return null;
  await client.query(`INSERT INTO diagnostic_order_events(order_id,from_status,to_status,actor_practitioner_id,detail) VALUES($1,$2,$3,$4,$5)`,[input.orderId,input.from,input.to,input.practitionerId,{note:input.note??null,scheduledAt:input.scheduledAt??null}]);
  if(input.to==="SCHEDULED"&&input.scheduledAt)await client.query(`INSERT INTO diagnostic_appointments(order_id,facility_id,scheduled_at,status,note) VALUES($1,$2,$3,'SCHEDULED',$4) ON CONFLICT(order_id) DO UPDATE SET scheduled_at=EXCLUDED.scheduled_at,status='SCHEDULED',note=EXCLUDED.note`,[input.orderId,input.facilityId,input.scheduledAt,input.note??null]);
  await client.query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,facility_id,action,detail) VALUES($1,$2,$3,'ORDER_TRANSITION',$4)`,[input.orderId,input.practitionerId,input.facilityId,{from:input.from,to:input.to}]);
  await recordOperation(client,{id:input.operationId,actorType:"PROVIDER",actorId:input.accountId,facilityId:input.facilityId,type:"DIAGNOSTIC_ORDER_TRANSITION",hash:input.payloadHash,result:{orderId:input.orderId,status:input.to}});
  await enqueueNotifications(client,input.orderId,input.to);return byId(client,input.orderId,input.facilityId);});
}
export async function transitionAppointment(input:{operationId:string;payloadHash:string;accountId:string;practitionerId:string;facilityId:string;orderId:string;status:string;scheduledAt?:string;note?:string}):Promise<OrderRow>{
 return withTransaction(async client=>{const prior=await operation(client,input.operationId,"PROVIDER",input.accountId);if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(client,input.orderId,input.facilityId);}
  const current=(await client.query<{appointment_id:string;status:string}>(`SELECT appointment_id,status FROM diagnostic_appointments WHERE order_id=$1 AND facility_id=$2 FOR UPDATE`,[input.orderId,input.facilityId])).rows[0];
  if(!current&&(!input.scheduledAt||input.status!=="SCHEDULED"))throw Object.assign(new Error("Schedule the appointment before changing its status."),{code:"23514"});
  const row=current??(await client.query<{appointment_id:string;status:string}>(`INSERT INTO diagnostic_appointments(order_id,facility_id,scheduled_at,status,note) VALUES($1,$2,$3,'SCHEDULED',$4) RETURNING appointment_id,status`,[input.orderId,input.facilityId,input.scheduledAt,input.note??null])).rows[0]!;
  if(current)await client.query(`UPDATE diagnostic_appointments SET status=$2,scheduled_at=COALESCE($3,scheduled_at),note=COALESCE($4,note) WHERE appointment_id=$1`,[row.appointment_id,input.status,input.scheduledAt??null,input.note??null]);
  await client.query(`INSERT INTO diagnostic_appointment_events(appointment_id,from_status,to_status,actor_practitioner_id,note) VALUES($1,$2,$3,$4,$5)`,[row.appointment_id,current?.status??null,input.status,input.practitionerId,input.note??null]);
  await client.query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,facility_id,action,detail) VALUES($1,$2,$3,'APPOINTMENT_TRANSITION',$4)`,[input.orderId,input.practitionerId,input.facilityId,{from:current?.status??null,to:input.status}]);
  await recordOperation(client,{id:input.operationId,actorType:"PROVIDER",actorId:input.accountId,facilityId:input.facilityId,type:"DIAGNOSTIC_APPOINTMENT_TRANSITION",hash:input.payloadHash,result:{orderId:input.orderId,status:input.status}});return byId(client,input.orderId,input.facilityId);});
}
export async function transitionSpecimen(input:{operationId:string;payloadHash:string;accountId:string;practitionerId:string;facilityId:string;orderId:string;from:string;to:string;occurredAt:string;note?:string}):Promise<OrderRow|null>{
 return withTransaction(async client=>{const prior=await operation(client,input.operationId,"PROVIDER",input.accountId);if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(client,String(prior.result["orderId"]),input.facilityId);}
  const specimen=(await client.query<{specimen_id:string}>(`UPDATE diagnostic_specimens SET status=$3,collected_at=CASE WHEN $3='COLLECTED' THEN $4 ELSE collected_at END,received_at=CASE WHEN $3='RECEIVED' THEN $4 ELSE received_at END,rejection_reason=CASE WHEN $3='REJECTED' THEN $5 ELSE rejection_reason END WHERE order_id=$1 AND status=$2 RETURNING specimen_id`,[input.orderId,input.from,input.to,input.occurredAt,input.note??null])).rows[0];if(!specimen)return null;
  await client.query(`INSERT INTO diagnostic_specimen_events(specimen_id,from_status,to_status,actor_practitioner_id,detail,occurred_at) VALUES($1,$2,$3,$4,$5,$6)`,[specimen.specimen_id,input.from,input.to,input.practitionerId,{note:input.note??null},input.occurredAt]);
  await client.query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,facility_id,action,detail) VALUES($1,$2,$3,'SPECIMEN_TRANSITION',$4)`,[input.orderId,input.practitionerId,input.facilityId,{from:input.from,to:input.to}]);
  if(input.to==="COLLECTED")await client.query(`UPDATE diagnostic_orders SET status='IN_PROGRESS' WHERE order_id=$1 AND status IN ('ACCEPTED','SCHEDULED')`,[input.orderId]);
  await recordOperation(client,{id:input.operationId,actorType:"PROVIDER",actorId:input.accountId,facilityId:input.facilityId,type:"DIAGNOSTIC_SPECIMEN_TRANSITION",hash:input.payloadHash,result:{orderId:input.orderId,specimenStatus:input.to}});
  await enqueueNotifications(client,input.orderId,input.to);return byId(client,input.orderId,input.facilityId);});
}
async function enqueueNotifications(client:pg.PoolClient,orderId:string,status:string):Promise<void>{
 const pref=(await client.query<{sms_opt_in:boolean;voice_opt_in:boolean}>(`SELECT p.sms_opt_in,p.voice_opt_in FROM diagnostic_orders o JOIN diagnostic_notification_preferences p USING(patient_id) WHERE o.order_id=$1`,[orderId])).rows[0];
 if(!pref)return;const payload={trackingCodeOnly:true,status};
 if(pref.sms_opt_in)await client.query(`INSERT INTO notification_jobs(job_type,order_id,idempotency_key,payload) VALUES('DIAGNOSTIC_STATUS_SMS',$1,$2,$3) ON CONFLICT(idempotency_key) DO NOTHING`,[orderId,`diag:${orderId}:${status}:sms`,payload]);
 if(pref.voice_opt_in)await client.query(`INSERT INTO notification_jobs(job_type,order_id,idempotency_key,payload) VALUES('DIAGNOSTIC_STATUS_VOICE',$1,$2,$3) ON CONFLICT(idempotency_key) DO NOTHING`,[orderId,`diag:${orderId}:${status}:voice`,payload]);
}
export async function publishResult(input:{operationId:string;payloadHash:string;accountId:string;practitionerId:string;facilityId:string;order:OrderRow;summary:unknown;bundle:unknown;checksum:string}):Promise<OrderRow>{
 return withTransaction(async client=>{const prior=await operation(client,input.operationId,"PROVIDER",input.accountId);if(prior){if(prior.payload_hash!==input.payloadHash)throw Object.assign(new Error("Operation id reused."),{code:"23505"});return byId(client,String(prior.result["orderId"]),input.facilityId);}
  const context=(await client.query<{care_context_id:string}>(`INSERT INTO abdm_care_contexts(patient_id,hip_facility_id,context_reference,display) VALUES($1,$2,$3,$4)
   ON CONFLICT(hip_facility_id,context_reference) DO UPDATE SET display=EXCLUDED.display RETURNING care_context_id`,[input.order.patient_id,input.facilityId,`diagnostic-order-${input.order.order_id}`,`${input.order.display} result`])).rows[0];if(!context)throw new Error("Care context creation failed.");
  const record=(await client.query<{record_id:string}>(`INSERT INTO abdm_health_records(patient_id,care_context_id,hip_facility_id,author_practitioner_id,record_type,title,authored_at,profile_url,fhir_bundle,summary,checksum)
   VALUES($1,$2,$3,$4,'DIAGNOSTIC_REPORT',$5,now(),'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord',$6,$7,$8) RETURNING record_id`,[input.order.patient_id,context.care_context_id,input.facilityId,input.practitionerId,`${input.order.display} result`,input.bundle,input.summary,input.checksum])).rows[0];if(!record)throw new Error("Diagnostic result insert failed.");
  await client.query(`UPDATE diagnostic_orders SET status='RESULT_READY',result_record_id=$2 WHERE order_id=$1`,[input.order.order_id,record.record_id]);
  await client.query(`INSERT INTO diagnostic_order_events(order_id,from_status,to_status,actor_practitioner_id,detail) VALUES($1,$2,'RESULT_READY',$3,$4)`,[input.order.order_id,input.order.status,input.practitionerId,{recordId:record.record_id}]);
  await client.query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,facility_id,action,detail) VALUES($1,$2,$3,'RESULT_PUBLISHED',$4)`,[input.order.order_id,input.practitionerId,input.facilityId,{recordId:record.record_id}]);
  await recordOperation(client,{id:input.operationId,actorType:"PROVIDER",actorId:input.accountId,facilityId:input.facilityId,type:"DIAGNOSTIC_RESULT_PUBLISH",hash:input.payloadHash,result:{orderId:input.order.order_id,recordId:record.record_id}});
  await enqueueNotifications(client,input.order.order_id,"RESULT_READY");return byId(client,input.order.order_id,input.facilityId);});
}
export async function auditOrder(input:{orderId:string;practitionerId?:string;patientId?:string;facilityId?:string;action:string;detail?:unknown}):Promise<void>{await query(`INSERT INTO diagnostic_access_audit(order_id,practitioner_id,patient_id,facility_id,action,detail) VALUES($1,$2,$3,$4,$5,$6)`,[input.orderId,input.practitionerId??null,input.patientId??null,input.facilityId??null,input.action,input.detail??{}]);}
export async function orderByTrackingCode(code:string,phone:string):Promise<{status:string;tracking_code:string}|null>{return(await query<{status:string;tracking_code:string}>(`SELECT o.status,o.tracking_code FROM diagnostic_orders o JOIN patients p USING(patient_id) WHERE o.tracking_code=$1 AND p.phone=$2`,[code,phone]))[0]??null;}
