import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import bcrypt from "bcryptjs";

const DOCUMENT_BUNDLE="https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle";
const PROFILE:Record<string,string>={
  OP_CONSULTATION:"OPConsultRecord",PRESCRIPTION:"PrescriptionRecord",DIAGNOSTIC_REPORT:"DiagnosticReportRecord",
  DISCHARGE_SUMMARY:"DischargeSummaryRecord",IMMUNIZATION_RECORD:"ImmunizationRecord",WELLNESS_RECORD:"WellnessRecord",
  HEALTH_DOCUMENT:"HealthDocumentRecord",INVOICE_RECORD:"InvoiceRecord",
};
const sha=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");

const PRACTITIONERS=[
  ["HPR-MOCK-BR-0001","Dr Aditi Sinha","MBBS, MD","Obstetrics and Gynaecology","+917101000001","DOCTOR",0],
  ["HPR-MOCK-BR-0002","Dr Imran Alam","MBBS, MD","Paediatrics","+917101000002","DOCTOR",0],
  ["HPR-MOCK-BR-0003","Dr Kavita Rao","MBBS, MD","Internal Medicine","+917101000003","DOCTOR",2],
  ["HPR-MOCK-BR-0004","Dr Arun Prakash","MBBS, MS","General Surgery","+917101000004","DOCTOR",2],
  ["HPR-MOCK-BR-0005","Dr Neha Kumari","MBBS","General Medicine","+917101000005","DOCTOR",3],
  ["HPR-MOCK-BR-0006","Sunita Devi","GNM","Nursing","+917101000006","NURSE",0],
  ["HPR-MOCK-BR-0007","Rohit Kumar","BMLT","Laboratory","+917101000007","LAB_TECH",0],
  ["HPR-MOCK-BR-0008","Dr Priya Singh","MBBS","Family Medicine","+917101000008","DOCTOR",6],
  ["HPR-MOCK-BR-0009","Mohan Das","BSc Health Information","Medical Records","+917101000009","RECORDS_OFFICER",0],
  ["HPR-MOCK-BR-0010","Anjali Verma","MHA","Facility Administration","+917101000010","FACILITY_ADMIN",0],
] as const;
const PATIENTS=[
  ["+917201000001","Demo Patient Asha Pregnancy","asha.pregnancy@abdm","Rajgir, Nalanda"],
  ["+917201000002","Demo Patient Child Rohan","rohan.child@abdm","Biharsharif, Nalanda"],
  ["+917201000003","Demo Patient Meera Chronic","meera.chronic@abdm","Hilsa, Nalanda"],
  ["+917201000004","Demo Patient Ravi Recovery","ravi.recovery@abdm","Noorsarai, Nalanda"],
  ["+917201000005","Demo Patient Shanti Senior","shanti.senior@abdm","Islampur, Nalanda"],
  ["+917201000006","Demo Patient Aman General","aman.general@abdm","Sarmera, Nalanda"],
] as const;

function bundle(type:string,patientId:string,practitionerId:string,facilityId:string,title:string,date:string,summary:Record<string,unknown>){
  const profile=`https://nrces.in/ndhm/fhir/r4/StructureDefinition/${PROFILE[type]}`;
  return {resourceType:"Bundle",type:"document",timestamp:date,meta:{profile:[DOCUMENT_BUNDLE]},identifier:{system:"https://swasthyasetu.example/mock-record",value:randomUUID()},entry:[
    {fullUrl:`urn:uuid:${randomUUID()}`,resource:{resourceType:"Composition",id:randomUUID(),status:"final",type:{text:title},date,title,meta:{profile:[profile]},subject:{reference:`Patient/${patientId}`},author:[{reference:`Practitioner/${practitionerId}`}],custodian:{reference:`Organization/${facilityId}`},section:[{title:"Synthetic demonstration summary",text:{status:"generated",div:`<div xmlns=\"http://www.w3.org/1999/xhtml\">${title}</div>`}}]}},
    {fullUrl:`Patient/${patientId}`,resource:{resourceType:"Patient",id:patientId,meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"]},identifier:[{system:"https://healthid.ndhm.gov.in",value:"synthetic-masked"}]}},
    {fullUrl:`Practitioner/${practitionerId}`,resource:{resourceType:"Practitioner",id:practitionerId,meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner"]}}},
    {fullUrl:`Organization/${facilityId}`,resource:{resourceType:"Organization",id:facilityId,meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization"]}}},
    {fullUrl:`urn:uuid:${randomUUID()}`,resource:{resourceType:"Observation",id:randomUUID(),status:"final",code:{text:"Synthetic demonstration information"},subject:{reference:`Patient/${patientId}`},effectiveDateTime:date,valueString:JSON.stringify(summary)}},
  ]};
}

export async function loadAbdmSeed(client:pg.PoolClient,districtCode:string):Promise<void>{
  const facilities=(await client.query<{facility_id:string;name:string}>(`SELECT facility_id,name FROM facilities WHERE district_code=$1 ORDER BY capability_level DESC,name`,[districtCode])).rows;
  if(facilities.length<7)throw new Error("Mock ABDM seed requires at least seven demo facilities.");
  const providerPassword=await bcrypt.hash("Provider@demo1!",10);
  const practitionerIds:string[]=[];
  for(const [hpr,name,qualification,specialty,phone,role,index] of PRACTITIONERS){
    const practitioner=(await client.query<{practitioner_id:string}>(`INSERT INTO practitioners(hpr_id,full_name,qualification,specialty)
      VALUES($1,$2,$3,$4) ON CONFLICT(hpr_id) DO UPDATE SET full_name=EXCLUDED.full_name,qualification=EXCLUDED.qualification,specialty=EXCLUDED.specialty,is_active=true
      RETURNING practitioner_id`,[hpr,name,qualification,specialty])).rows[0];if(!practitioner)throw new Error("Practitioner seed failed.");practitionerIds.push(practitioner.practitioner_id);
    await client.query(`INSERT INTO provider_accounts(practitioner_id,phone,password_hash) VALUES($1,$2,$3)
      ON CONFLICT(phone) DO UPDATE SET practitioner_id=EXCLUDED.practitioner_id,password_hash=EXCLUDED.password_hash,is_active=true`,[practitioner.practitioner_id,phone,providerPassword]);
    await client.query(`INSERT INTO practitioner_facilities(practitioner_id,facility_id,role) VALUES($1,$2,$3)
      ON CONFLICT(practitioner_id,facility_id) DO UPDATE SET role=EXCLUDED.role,is_active=true`,[practitioner.practitioner_id,facilities[index]?.facility_id,role]);
  }
  // Give the first three doctors a second facility so the portal can demonstrate facility switching.
  for(let i=0;i<3;i+=1)await client.query(`INSERT INTO practitioner_facilities(practitioner_id,facility_id,role) VALUES($1,$2,'DOCTOR') ON CONFLICT DO NOTHING`,[practitionerIds[i],facilities[4+i]?.facility_id]);

  const patientPassword=await bcrypt.hash("Patient@demo1!",10);const patientIds:string[]=[];
  for(const [phone,name,address,home] of PATIENTS){
    const patient=(await client.query<{patient_id:string}>(`INSERT INTO patients(phone,full_name,password_hash,district_code,home_address,verification_status,verified_at)
      VALUES($1,$2,$3,$4,$5,'VERIFIED',now()) ON CONFLICT(phone) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
      district_code=EXCLUDED.district_code,home_address=EXCLUDED.home_address,verification_status='VERIFIED',verified_at=COALESCE(patients.verified_at,now()),is_active=true RETURNING patient_id`,
      [phone,name,patientPassword,districtCode,home])).rows[0];if(!patient)throw new Error("Patient seed failed.");patientIds.push(patient.patient_id);
    const masked=`${address.slice(0,1)}***@abdm`;
    await client.query(`INSERT INTO mock_abha_profiles(patient_id,identifier_hash,identifier_masked) VALUES($1,$2,$3)
      ON CONFLICT(patient_id) DO UPDATE SET identifier_hash=EXCLUDED.identifier_hash,identifier_masked=EXCLUDED.identifier_masked,status='ACTIVE'`,[patient.patient_id,sha(address),masked]);
    await client.query(`INSERT INTO identity_verification_sessions(patient_id,method,provider,provider_reference,status,consented_at,completed_at)
      VALUES($1,'AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS','development-mock',$2,'VERIFIED',now(),now()) ON CONFLICT(provider_reference) DO NOTHING`,[patient.patient_id,`mock-verification-${phone}`]);
    const existing=(await client.query(`SELECT 1 FROM abha_link_sessions WHERE patient_id=$1 AND status='LINKED'`,[patient.patient_id])).rowCount;
    if(!existing)await client.query(`INSERT INTO abha_link_sessions(patient_id,provider,identifier_hash,identifier_masked,status,consented_at,completed_at)
      VALUES($1,'abdm-development-mock',$2,$3,'LINKED',now(),now())`,[patient.patient_id,sha(address),masked]);
    await client.query(`INSERT INTO abdm_patient_coverage(patient_id,scheme_name,member_id_masked,valid_until) VALUES($1,'Ayushman Bharat PM-JAY (synthetic)','PMJAY-****-DEMO',current_date+365)
      ON CONFLICT(patient_id,scheme_name) DO UPDATE SET valid_until=EXCLUDED.valid_until`,[patient.patient_id]);
  }

  const scenarios:Array<[number,number,number,string,string,string,Record<string,unknown>]>=[
    [0,6,0,"WELLNESS_RECORD","Antenatal wellness visit","2026-06-10T09:00:00.000Z",{stage:"second trimester",bloodPressure:"112/72",weightKg:54}],
    [0,0,0,"DIAGNOSTIC_REPORT","Antenatal laboratory report","2026-07-12T10:00:00.000Z",{haemoglobin:"10.8 g/dL",bloodGroup:"B+"}],
    [0,0,0,"DISCHARGE_SUMMARY","Delivery discharge summary","2026-08-20T14:00:00.000Z",{disposition:"home",followUp:"postnatal review"}],
    [1,6,1,"IMMUNIZATION_RECORD","Child immunization record","2026-03-03T08:30:00.000Z",{vaccine:"Pentavalent",dose:"3"}],
    [1,0,1,"OP_CONSULTATION","Child illness consultation","2026-07-18T11:00:00.000Z",{complaint:"fever and cough",note:"synthetic clinician-entered record"}],
    [1,0,1,"PRESCRIPTION","Child consultation prescription","2026-07-18T11:20:00.000Z",{medicine:"Paracetamol",instruction:"synthetic demo only"}],
    [2,3,4,"WELLNESS_RECORD","Chronic care monitoring","2026-05-04T09:45:00.000Z",{bloodPressure:"146/92",bloodGlucose:"154 mg/dL"}],
    [2,2,2,"OP_CONSULTATION","Internal medicine follow-up","2026-07-02T12:00:00.000Z",{conditions:["diabetes","hypertension"],enteredBy:"doctor"}],
    [3,2,3,"DISCHARGE_SUMMARY","Post-operative discharge","2026-04-15T16:00:00.000Z",{followUp:"wound review",status:"stable at discharge"}],
    [4,3,4,"PRESCRIPTION","Current medicines list","2026-06-21T09:30:00.000Z",{medicines:["synthetic medicine A","synthetic medicine B"]}],
    [5,5,7,"HEALTH_DOCUMENT","Uploaded legacy clinic note","2025-12-10T10:00:00.000Z",{document:"synthetic legacy note",source:"patient upload"}],
    [5,0,0,"INVOICE_RECORD","Outpatient invoice","2026-08-01T13:00:00.000Z",{totalInr:250,paymentStatus:"paid",synthetic:true}],
  ];
  for(const [patientIndex,facilityIndex,practitionerIndex,type,title,date,summary] of scenarios){
    const patientId=patientIds[patientIndex];const facilityId=facilities[facilityIndex]?.facility_id;const practitionerId=practitionerIds[practitionerIndex];
    if(!patientId||!facilityId||!practitionerId)throw new Error("Invalid mock ABDM scenario index.");
    const reference=`seed-${patientIndex}-${facilityIndex}`;
    const context=(await client.query<{care_context_id:string}>(`INSERT INTO abdm_care_contexts(patient_id,hip_facility_id,context_reference,display,link_status,linked_at)
      VALUES($1,$2,$3,$4,'LINKED',now()) ON CONFLICT(hip_facility_id,context_reference) DO UPDATE SET display=EXCLUDED.display,link_status='LINKED',linked_at=now() RETURNING care_context_id`,
      [patientId,facilityId,reference,`${title} care context`])).rows[0];if(!context)throw new Error("Care context seed failed.");
    const fhir=bundle(type,patientId,practitionerId,facilityId,title,date,summary);const checksum=sha(JSON.stringify({patientId,facilityId,type,title,date,summary}));
    await client.query(`INSERT INTO abdm_health_records(patient_id,care_context_id,hip_facility_id,author_practitioner_id,record_type,title,authored_at,profile_url,fhir_bundle,summary,checksum)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(hip_facility_id,checksum) DO NOTHING`,
      [patientId,context.care_context_id,facilityId,practitionerId,type,title,date,`https://nrces.in/ndhm/fhir/r4/StructureDefinition/${PROFILE[type]}`,fhir,summary,checksum]);
  }
}
