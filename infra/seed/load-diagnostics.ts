import { createHash } from "node:crypto";
import type pg from "pg";

type Client = pg.PoolClient;

const TESTS = [
  ["CBC", "Complete blood count", "LAB", "Venous blood", "No special preparation."],
  ["HBA1C", "HbA1c", "LAB", "Venous blood", "No fasting is normally required; confirm with the facility."],
  ["GLUCOSE-FASTING", "Fasting blood glucose", "LAB", "Venous blood", "Confirm fasting instructions with the facility."],
  ["URINE-RME", "Urine routine and microscopy", "LAB", "Urine", "Ask the collection site for a clean container."],
  ["PREGNANCY-USG", "Obstetric ultrasound", "IMAGING", null, "Confirm bladder preparation and appointment time."],
  ["XRAY-CHEST", "Chest X-ray", "IMAGING", null, "Tell staff about possible pregnancy before imaging."],
  ["ECG-12", "12-lead ECG", "POINT_OF_CARE", null, "Wear clothing that permits chest lead placement."],
  ["MALARIA-RDT", "Malaria rapid diagnostic test", "POINT_OF_CARE", "Capillary blood", "No special preparation."],
] as const;

const DEMO_PATIENT_PHONES = [
  "+917201000001",
  "+917201000002",
  "+917201000003",
  "+917201000004",
  "+917201000005",
  "+917201000006",
] as const;

function stableUuid(key: string): string {
  const hex = createHash("sha256").update(`swasthyasetu-diagnostic:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
}

function trackingCode(key: string): string {
  const value = Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 10), 16) % 10_000_000;
  return `D${value.toString().padStart(7, "0")}`;
}

interface WorkflowSeedCounts { orders: number; specimens: number; appointments: number; results: number; notifications: number }

async function seedDiagnosticWorkflows(client: Client, districtCode: string): Promise<WorkflowSeedCounts> {
  const facilities = (await client.query<{ facility_id: string }>(
    `SELECT facility_id FROM facilities WHERE district_code=$1 ORDER BY capability_level DESC,name LIMIT 2`,
    [districtCode],
  )).rows;
  const originFacilityId = facilities[0]?.facility_id;
  const spokeFacilityId = facilities[1]?.facility_id;
  if (!originFacilityId || !spokeFacilityId) throw new Error("diagnostic workflow seed requires two facilities");

  const doctor = (await client.query<{ practitioner_id: string }>(
    `SELECT p.practitioner_id FROM practitioners p JOIN practitioner_facilities pf USING(practitioner_id)
      WHERE pf.facility_id=$1 AND pf.role='DOCTOR' AND p.is_active=true AND pf.is_active=true ORDER BY p.hpr_id LIMIT 1`,
    [originFacilityId],
  )).rows[0];
  const labTech = (await client.query<{ practitioner_id: string }>(
    `SELECT practitioner_id FROM practitioners WHERE hpr_id='HPR-MOCK-BR-0007'`,
  )).rows[0];
  if (!doctor || !labTech) throw new Error("diagnostic workflow seed requires the synthetic doctor and lab technician");
  await client.query(
    `INSERT INTO practitioner_facilities(practitioner_id,facility_id,role,is_active) VALUES($1,$2,'LAB_TECH',true)
     ON CONFLICT(practitioner_id,facility_id) DO UPDATE SET role='LAB_TECH',is_active=true`,
    [labTech.practitioner_id, spokeFacilityId],
  );

  const patients = (await client.query<{ patient_id: string }>(
    `SELECT patient_id FROM patients WHERE district_code=$1 AND phone=ANY($2::text[]) ORDER BY phone`,
    [districtCode, DEMO_PATIENT_PHONES],
  )).rows;
  if (patients.length < 6) throw new Error("diagnostic workflow seed requires six synthetic patients");

  const scenarios = [
    { key:"pregnancy-ultrasound",patient:0,code:"PREGNANCY-USG",destination:spokeFacilityId,status:"SCHEDULED",appointment:"SCHEDULED",consent:"GRANTED",priority:"ROUTINE" },
    { key:"child-cbc-transit",patient:1,code:"CBC",destination:spokeFacilityId,status:"IN_PROGRESS",specimen:"IN_TRANSIT",consent:"GRANTED",priority:"URGENT" },
    { key:"chronic-hba1c-result",patient:2,code:"HBA1C",destination:originFacilityId,status:"RESULT_READY",specimen:"RECEIVED",consent:"LOCAL",priority:"ROUTINE",result:true },
    { key:"recovery-xray-missed",patient:3,code:"XRAY-CHEST",destination:spokeFacilityId,status:"SCHEDULED",appointment:"MISSED",consent:"GRANTED",priority:"ROUTINE",overdue:true },
    { key:"senior-urine-rejected",patient:4,code:"URINE-RME",destination:originFacilityId,status:"IN_PROGRESS",specimen:"REJECTED",consent:"LOCAL",priority:"ROUTINE",overdue:true },
    { key:"general-ecg-pending-consent",patient:5,code:"ECG-12",destination:spokeFacilityId,status:"CREATED",consent:"REQUESTED",priority:"ROUTINE" },
  ] as const;
  const now = Date.now();
  let specimens=0,appointments=0,results=0,notifications=0;
  for (const scenario of scenarios) {
    const patientId=patients[scenario.patient]?.patient_id;
    if(!patientId)throw new Error(`missing patient for ${scenario.key}`);
    const service=(await client.query<{service_id:string;display:string;kind:string;specimen_type:string|null}>(
      `SELECT s.service_id,t.display,t.kind,t.specimen_type FROM facility_diagnostic_services s JOIN diagnostic_tests t USING(test_id)
        WHERE s.facility_id=$1 AND t.code=$2 AND s.is_active=true AND t.is_active=true`,
      [scenario.destination,scenario.code],
    )).rows[0];
    if(!service)throw new Error(`missing seeded service ${scenario.code} at scenario facility`);
    const orderId=stableUuid(`order:${scenario.key}`),consentRequestId=scenario.consent==="LOCAL"?null:stableUuid(`consent:${scenario.key}`);
    let consentGrantId:string|null=null;
    if(consentRequestId){
      const granted=scenario.consent==="GRANTED";
      await client.query(
        `INSERT INTO abdm_consent_requests(consent_request_id,patient_id,requesting_facility_id,requesting_practitioner_id,purpose,requested_hi_types,date_from,date_to,valid_until,status,explanation,decided_at)
         VALUES($1,$2,$3,$4,$5,$6,now()-interval '2 years',now(),now()+interval '7 days',$7,$8,$9)
         ON CONFLICT(consent_request_id) DO UPDATE SET purpose=EXCLUDED.purpose,requested_hi_types=EXCLUDED.requested_hi_types,
           date_from=EXCLUDED.date_from,date_to=EXCLUDED.date_to,explanation=EXCLUDED.explanation`,
        [consentRequestId,patientId,scenario.destination,doctor.practitioner_id,`Synthetic diagnostic coordination for ${service.display}`,["OP_CONSULTATION","PRESCRIPTION","DIAGNOSTIC_REPORT"],granted?"GRANTED":"REQUESTED",{en:"Share selected records for this synthetic diagnostic order.",hi:"इस कृत्रिम जाँच आदेश के लिए चुने हुए रिकॉर्ड साझा करें।",mr:"या कृत्रिम तपासणी आदेशासाठी निवडक नोंदी शेअर करा."},granted?new Date().toISOString():null],
      );
      await client.query(
        `INSERT INTO abdm_consent_events(event_id,consent_request_id,event_type,actor_type,actor_id,detail)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING`,
        [stableUuid(`consent-event:${scenario.key}:requested`),consentRequestId,"REQUESTED","PROVIDER",doctor.practitioner_id,{syntheticSeed:true}],
      );
      if(granted){
        const seededGrantId=stableUuid(`grant:${scenario.key}`);
        await client.query(
          `INSERT INTO abdm_consent_grants(consent_grant_id,consent_request_id,patient_id,hiu_facility_id,approved_hi_types,date_from,date_to,valid_from,valid_until,status)
           VALUES($1,$2,$3,$4,$5,now()-interval '2 years',now(),now()-interval '1 hour',now()+interval '7 days','GRANTED')
           ON CONFLICT(consent_request_id) DO NOTHING`,
          [seededGrantId,consentRequestId,patientId,scenario.destination,["OP_CONSULTATION","PRESCRIPTION","DIAGNOSTIC_REPORT"]],
        );
        await client.query(
          `INSERT INTO abdm_consent_events(event_id,consent_request_id,event_type,actor_type,actor_id,detail)
           VALUES($1,$2,'GRANTED','PATIENT',$3,$4) ON CONFLICT(event_id) DO NOTHING`,
          [stableUuid(`consent-event:${scenario.key}:granted`),consentRequestId,patientId,{syntheticSeed:true}],
        );
      }
      consentGrantId=(await client.query<{consent_grant_id:string}>(
        `SELECT g.consent_grant_id FROM abdm_consent_grants g JOIN abdm_consent_requests r USING(consent_request_id)
          WHERE g.consent_request_id=$1 AND r.status='GRANTED' AND g.status='GRANTED' AND g.valid_until>now()`,
        [consentRequestId],
      )).rows[0]?.consent_grant_id??null;
    }
    const scheduledAt=scenario.appointment?new Date(now+(scenario.appointment==="MISSED"?-2:1)*86_400_000).toISOString():null;
    const expectedBy=scenario.overdue?new Date(now-86_400_000).toISOString():scenario.status==="IN_PROGRESS"?new Date(now+6*3_600_000).toISOString():scheduledAt?new Date(Date.parse(scheduledAt)+86_400_000).toISOString():null;
    const request={resourceType:"ServiceRequest",id:stableUuid(`service-request:${scenario.key}`),status:"active",intent:"order",code:{coding:[{system:"https://example.org/swasthyasetu/mock-diagnostic-code",code:scenario.code,display:service.display}]},subject:{reference:`Patient/${patientId}`},authoredOn:new Date(now-86_400_000).toISOString(),note:[{text:"Synthetic seeded order; not for clinical use."}]};
    await client.query(
      `INSERT INTO diagnostic_orders(order_id,tracking_code,patient_id,service_id,origin_facility_id,destination_facility_id,ordering_practitioner_id,consent_request_id,consent_grant_id,priority,practitioner_reason,service_request,status,scheduled_at,expected_by,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Synthetic clinician-entered demonstration reason.',$11,$12,$13,$14,now()-interval '1 day')
       ON CONFLICT(order_id) DO UPDATE SET consent_request_id=EXCLUDED.consent_request_id,consent_grant_id=EXCLUDED.consent_grant_id,
         priority=EXCLUDED.priority,practitioner_reason=EXCLUDED.practitioner_reason,service_request=EXCLUDED.service_request,status=EXCLUDED.status,
         scheduled_at=EXCLUDED.scheduled_at,expected_by=EXCLUDED.expected_by`,
      [orderId,trackingCode(scenario.key),patientId,service.service_id,originFacilityId,scenario.destination,doctor.practitioner_id,consentRequestId,consentGrantId,scenario.priority,request,scenario.status,scheduledAt,expectedBy],
    );
    await client.query(
      `INSERT INTO diagnostic_order_items(order_item_id,order_id,service_id,service_request) VALUES($1,$2,$3,$4)
       ON CONFLICT(order_id,service_id) DO UPDATE SET service_request=EXCLUDED.service_request`,
      [stableUuid(`order-item:${scenario.key}`),orderId,service.service_id,request],
    );
    const statusPath=scenario.status==="CREATED"?["CREATED"]:scenario.status==="SCHEDULED"?["CREATED","ACCEPTED","SCHEDULED"]:scenario.status==="IN_PROGRESS"?["CREATED","ACCEPTED","SCHEDULED","IN_PROGRESS"]:["CREATED","ACCEPTED","SCHEDULED","IN_PROGRESS","RESULT_READY"];
    for(let index=0;index<statusPath.length;index++)await client.query(
      `INSERT INTO diagnostic_order_events(order_event_id,order_id,from_status,to_status,actor_practitioner_id,detail,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,now()-(($7::int)||' hours')::interval) ON CONFLICT(order_event_id) DO NOTHING`,
      [stableUuid(`order-event:${scenario.key}:${statusPath[index]}`),orderId,index?statusPath[index-1]:null,statusPath[index],index===0?doctor.practitioner_id:labTech.practitioner_id,{syntheticSeed:true},statusPath.length-index],
    );
    if("specimen" in scenario&&scenario.specimen){
      const specimenId=stableUuid(`specimen:${scenario.key}`),rejected=scenario.specimen==="REJECTED";
      await client.query(
        `INSERT INTO diagnostic_specimens(specimen_id,order_id,accession_code,specimen_type,status,collected_at,received_at,rejection_reason)
         VALUES($1,$2,$3,$4,$5,now()-interval '5 hours',$6,$7)
         ON CONFLICT(order_id) DO UPDATE SET status=EXCLUDED.status,collected_at=EXCLUDED.collected_at,received_at=EXCLUDED.received_at,rejection_reason=EXCLUDED.rejection_reason`,
        [specimenId,orderId,`SEED-${trackingCode(scenario.key).slice(1)}`,service.specimen_type??"Synthetic specimen",scenario.specimen,scenario.specimen==="RECEIVED"?new Date(now-2*3_600_000).toISOString():null,rejected?"Synthetic rejection: container integrity issue.":null],
      );
      const specimenPath=scenario.specimen==="IN_TRANSIT"?["COLLECTED","IN_TRANSIT"]:scenario.specimen==="RECEIVED"?["COLLECTED","IN_TRANSIT","RECEIVED"]:["COLLECTED","REJECTED"];
      for(let index=0;index<specimenPath.length;index++)await client.query(
        `INSERT INTO diagnostic_specimen_events(specimen_event_id,specimen_id,from_status,to_status,actor_practitioner_id,detail,occurred_at)
         VALUES($1,$2,$3,$4,$5,$6,now()-(($7::int)||' hours')::interval) ON CONFLICT(specimen_event_id) DO NOTHING`,
        [stableUuid(`specimen-event:${scenario.key}:${specimenPath[index]}`),specimenId,index?specimenPath[index-1]:"COLLECTION_PENDING",specimenPath[index],labTech.practitioner_id,{syntheticSeed:true,...(rejected?{reason:"Synthetic container integrity issue."}:{})},specimenPath.length-index],
      );
      specimens++;
    }
    if("appointment" in scenario&&scenario.appointment&&scheduledAt){
      const appointmentId=stableUuid(`appointment:${scenario.key}`);
      await client.query(
        `INSERT INTO diagnostic_appointments(appointment_id,order_id,facility_id,scheduled_at,status,note) VALUES($1,$2,$3,$4,$5,'Synthetic demonstration appointment.')
         ON CONFLICT(order_id) DO UPDATE SET scheduled_at=EXCLUDED.scheduled_at,status=EXCLUDED.status,note=EXCLUDED.note`,
        [appointmentId,orderId,scenario.destination,scheduledAt,scenario.appointment],
      );
      await client.query(
        `INSERT INTO diagnostic_appointment_events(appointment_event_id,appointment_id,from_status,to_status,actor_practitioner_id,note)
         VALUES($1,$2,$3,$4,$5,'Synthetic demonstration appointment event.') ON CONFLICT(appointment_event_id) DO NOTHING`,
        [stableUuid(`appointment-event:${scenario.key}:${scenario.appointment}`),appointmentId,scenario.appointment==="MISSED"?"SCHEDULED":null,scenario.appointment,labTech.practitioner_id],
      );
      appointments++;
    }
    if("result" in scenario&&scenario.result){
      const context=(await client.query<{care_context_id:string}>(
        `INSERT INTO abdm_care_contexts(care_context_id,patient_id,hip_facility_id,context_reference,display,link_status)
         VALUES($1,$2,$3,$4,$5,'PENDING') ON CONFLICT(hip_facility_id,context_reference) DO UPDATE SET display=EXCLUDED.display RETURNING care_context_id`,
        [stableUuid(`care-context:${scenario.key}`),patientId,scenario.destination,`seed-diagnostic-${scenario.key}`,`${service.display} synthetic result`],
      )).rows[0];
      if(!context)throw new Error("diagnostic result care context seed failed");
      const observationId=stableUuid(`observation:${scenario.key}`),recordId=stableUuid(`record:${scenario.key}`),authoredAt=new Date(now-30*60_000).toISOString();
      const bundle={resourceType:"Bundle",type:"document",meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"]},entry:[
        {resource:{resourceType:"Composition",id:stableUuid(`composition:${scenario.key}`),status:"final",title:`${service.display} synthetic report`,date:authoredAt,meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord"]},subject:{reference:`Patient/${patientId}`}}},
        {resource:request},{resource:{resourceType:"Specimen",id:stableUuid(`specimen:${scenario.key}`),status:"available",subject:{reference:`Patient/${patientId}`}}},
        {resource:{resourceType:"Observation",id:observationId,status:"final",code:{text:"Synthetic demonstration observation"},valueString:"Synthetic result — not for clinical use."}},
        {resource:{resourceType:"DiagnosticReport",id:stableUuid(`report:${scenario.key}`),status:"final",code:{text:service.display},result:[{reference:`Observation/${observationId}`}] }},
        {resource:{resourceType:"Patient",id:patientId}},{resource:{resourceType:"Practitioner",id:labTech.practitioner_id}},{resource:{resourceType:"Organization",id:scenario.destination}},
      ]};
      const checksum=createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
      await client.query(
        `INSERT INTO abdm_health_records(record_id,patient_id,care_context_id,hip_facility_id,author_practitioner_id,record_type,title,authored_at,profile_url,fhir_bundle,summary,checksum)
         VALUES($1,$2,$3,$4,$5,'DIAGNOSTIC_REPORT',$6,$7,'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord',$8,$9,$10)
         ON CONFLICT(record_id) DO UPDATE SET fhir_bundle=EXCLUDED.fhir_bundle,summary=EXCLUDED.summary,checksum=EXCLUDED.checksum`,
        [recordId,patientId,context.care_context_id,scenario.destination,labTech.practitioner_id,`${service.display} synthetic result`,authoredAt,bundle,{synthetic:true,note:"Synthetic result — not for clinical use."},checksum],
      );
      await client.query(`UPDATE diagnostic_orders SET result_record_id=$2,status='RESULT_READY' WHERE order_id=$1`,[orderId,recordId]);
      results++;
    }
    await client.query(
      `INSERT INTO diagnostic_access_audit(audit_id,order_id,practitioner_id,facility_id,action,detail)
       VALUES($1,$2,$3,$4,'SEED_CREATED',$5) ON CONFLICT(audit_id) DO NOTHING`,
      [stableUuid(`audit:${scenario.key}`),orderId,doctor.practitioner_id,originFacilityId,{syntheticSeed:true}],
    );
  }
  const missedOrderId=stableUuid("order:recovery-xray-missed"),resultOrderId=stableUuid("order:chronic-hba1c-result"),rejectedOrderId=stableUuid("order:senior-urine-rejected");
  const jobs=[
    ["DIAGNOSTIC_OVERDUE_FOLLOWUP",missedOrderId,"seed:diagnostic:missed-follow-up",{trackingCodeOnly:true,status:"OVERDUE"},"PENDING",null],
    ["DIAGNOSTIC_STATUS_SMS",resultOrderId,"seed:diagnostic:result-ready",{trackingCodeOnly:true,status:"RESULT_READY"},"PENDING",null],
    ["DIAGNOSTIC_STATUS_SMS",rejectedOrderId,"seed:diagnostic:failed-delivery",{trackingCodeOnly:true,status:"UPDATE"},"FAILED","Synthetic mock carrier failure."],
  ] as const;
  for(const [type,orderId,key,payload,status,error] of jobs){await client.query(
    `INSERT INTO notification_jobs(job_type,order_id,idempotency_key,payload,status,last_error) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(idempotency_key) DO NOTHING`,
    [type,orderId,key,payload,status,error],
  );notifications++;}
  return{orders:scenarios.length,specimens,appointments,results,notifications};
}

export async function loadDiagnosticSeed(client: Client, districtCode: string): Promise<{ tests: number; services: number; evidence: number } & WorkflowSeedCounts> {
  for (const [code, display, kind, specimen, preparation] of TESTS) {
    await client.query(
      `INSERT INTO diagnostic_tests(test_id,code_system,code,display,kind,specimen_type,preparation,is_demo_data)
       VALUES($1,'https://example.org/swasthyasetu/mock-diagnostic-code',$2,$3,$4,$5,$6::jsonb,true)
       ON CONFLICT(code_system,code) DO UPDATE SET display=EXCLUDED.display,kind=EXCLUDED.kind,
         specimen_type=EXCLUDED.specimen_type,preparation=EXCLUDED.preparation,is_active=true`,
      [stableUuid(`test:${code}`), code, display, kind, specimen, JSON.stringify({ en: preparation, hi: "तैयारी की पुष्टि सुविधा से करें।", mr: "तयारीची पुष्टी सुविधेशी करा." })],
    );
  }

  const facilities = await client.query<{ facility_id: string }>(
    `SELECT facility_id FROM facilities WHERE district_code=$1 ORDER BY capability_level DESC,name LIMIT 6`,
    [districtCode],
  );
  if (facilities.rows.length < 3) throw new Error("diagnostic seed requires at least three demo facilities");
  const hub = facilities.rows[0]!.facility_id;
  const workerUserId=(await client.query<{user_id:string}>(
    "SELECT user_id FROM users WHERE district_code=$1 AND role='ASHA' AND is_active=true ORDER BY phone LIMIT 1",
    [districtCode],
  )).rows[0]?.user_id;
  if(!workerUserId)throw new Error("diagnostic evidence seed requires an active synthetic ASHA worker");
  let services = 0;
  let evidence = 0;
  for (let testIndex=0; testIndex<TESTS.length; testIndex++) {
    const code = TESTS[testIndex]![0];
    const kind = TESTS[testIndex]![2];
    const sites = kind === "POINT_OF_CARE" ? facilities.rows.slice(0,3) : facilities.rows.slice(0,2);
    for (let siteIndex=0; siteIndex<sites.length; siteIndex++) {
      const facilityId = sites[siteIndex]!.facility_id;
      const isHubRoute = kind === "LAB" && facilityId !== hub;
      const serviceId = stableUuid(`service:${code}:${facilityId}`);
      const seededService=await client.query<{service_id:string}>(
        `INSERT INTO facility_diagnostic_services(
           service_id,facility_id,test_id,collection_supported,processing_model,processing_facility_id,
           appointment_required,turnaround_minutes_min,turnaround_minutes_max,
           indicative_cost_paisa_min,indicative_cost_paisa_max,supported_schemes,is_active)
         SELECT $1,$2,test_id,true,$4,$5,$6,$7,$8,$9,$10,$11,true
           FROM diagnostic_tests WHERE code_system='https://example.org/swasthyasetu/mock-diagnostic-code' AND code=$3
         ON CONFLICT(facility_id,test_id) DO UPDATE SET collection_supported=true,processing_model=EXCLUDED.processing_model,
           processing_facility_id=EXCLUDED.processing_facility_id,appointment_required=EXCLUDED.appointment_required,
           turnaround_minutes_min=EXCLUDED.turnaround_minutes_min,turnaround_minutes_max=EXCLUDED.turnaround_minutes_max,
           indicative_cost_paisa_min=EXCLUDED.indicative_cost_paisa_min,indicative_cost_paisa_max=EXCLUDED.indicative_cost_paisa_max,
           supported_schemes=EXCLUDED.supported_schemes,is_active=true
         RETURNING service_id`,
        [serviceId,facilityId,code,isHubRoute?"HUB":"ON_SITE",isHubRoute?hub:null,kind==="IMAGING",kind==="IMAGING"?60:30,kind==="IMAGING"?1440:360,0,kind==="IMAGING"?80000:35000,["Ayushman Bharat PM-JAY","State public health service"]],
      );
      const actualServiceId=seededService.rows[0]?.service_id;
      if(!actualServiceId)throw new Error(`diagnostic service seed failed for ${code} at ${facilityId}`);
      services++;
      const eventType = testIndex===3&&siteIndex===1 ? "STOCK_OUT_REPORTED" : testIndex===5&&siteIndex===1 ? "MACHINE_DOWN_REPORTED" : "COLLECTION_CONFIRMED";
      await client.query(
        `INSERT INTO diagnostic_service_events(service_event_id,service_id,evidence_type,observed_at,worker_user_id,note)
         VALUES($1,$2,$3,now()-($4::text||' days')::interval,$5,'Synthetic time-stamped demonstration evidence.')
         ON CONFLICT(service_event_id) DO UPDATE SET service_id=EXCLUDED.service_id,evidence_type=EXCLUDED.evidence_type,
           observed_at=EXCLUDED.observed_at,worker_user_id=EXCLUDED.worker_user_id,note=EXCLUDED.note`,
        [stableUuid(`evidence:${code}:${facilityId}`),actualServiceId,eventType,String((testIndex+siteIndex)%9),workerUserId],
      );
      evidence++;
    }
  }
  await client.query(
    `INSERT INTO diagnostic_notification_preferences(patient_id,sms_opt_in,voice_opt_in)
     SELECT patient_id,true,true FROM patients WHERE phone=ANY($1::text[])
     ON CONFLICT(patient_id) DO NOTHING`,
    [DEMO_PATIENT_PHONES],
  );
  const workflows=await seedDiagnosticWorkflows(client,districtCode);
  return { tests: TESTS.length, services, evidence, ...workflows };
}
