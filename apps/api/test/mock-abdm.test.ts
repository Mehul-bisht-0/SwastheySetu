import test from "node:test";
import assert from "node:assert/strict";
import { abdm } from "@swasthyasetu/contracts";
import { healthCheck, pool } from "../src/db/pool.ts";
import { authHeader, body, testApp } from "./helpers.ts";

test("ABDM contracts accept a document bundle and reject overlong routine consent",()=>{
 const composition="https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord";
 const parsed=abdm.createRecordRequest.parse({operationId:"123e4567-e89b-42d3-a456-426614174000",patientId:"123e4567-e89b-42d3-a456-426614174001",recordType:"OP_CONSULTATION",title:"Synthetic consultation",authoredAt:new Date().toISOString(),summary:{synthetic:true},fhirBundle:{resourceType:"Bundle",type:"document",meta:{profile:["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"]},entry:[{resource:{resourceType:"Composition",meta:{profile:[composition]}}},{resource:{resourceType:"Patient"}}]}});
 assert.equal(parsed.fhirBundle.type,"document");
 const tooLong=abdm.createConsentRequest.safeParse({patientId:"123e4567-e89b-42d3-a456-426614174001",purpose:"continuity of care",hiTypes:["OP_CONSULTATION"],dateFrom:new Date(0).toISOString(),dateTo:new Date().toISOString(),validUntil:new Date(Date.now()+31*86_400_000).toISOString()});
 assert.equal(tooLong.success,false);
});

const dbUp=await healthCheck();
let ready=false;
if(dbUp){const result=await pool.query<{ready:boolean}>(`SELECT to_regclass('public.abdm_consent_requests') IS NOT NULL
  AND EXISTS(SELECT 1 FROM provider_accounts WHERE phone='+917101000001') AS ready`);ready=result.rows[0]?.ready??false;}

test("provider access is denied until patient consent, then audited",{skip:!ready&&"mock ABDM migration and seed unavailable"},async()=>{
 const app=await testApp();let requestId="";let grantId="";
 try{
  const providerLogin=await app.inject({method:"POST",url:"/provider/auth/login",payload:{phone:"+917101000001",password:"Provider@demo1!"}});assert.equal(providerLogin.statusCode,200,providerLogin.payload);const providerToken=body<{data:{accessToken:string}}>(providerLogin).data.accessToken;
  const patientLogin=await app.inject({method:"POST",url:"/patients/login",payload:{phone:"+917201000001",password:"Patient@demo1!",deviceId:"abdm-integration-test-device",platform:"unknown",appVersion:"test"}});assert.equal(patientLogin.statusCode,200,patientLogin.payload);const patient=body<{data:{accessToken:string;patient:{patientId:string}}}>(patientLogin).data;
  const found=await app.inject({method:"POST",url:"/mock-abdm/discovery/lookup",headers:authHeader(providerToken),payload:{identifier:"asha.pregnancy@abdm"}});assert.equal(found.statusCode,200,found.payload);assert.equal(body<{data:{patientId:string}}>(found).data.patientId,patient.patient.patientId);
  const before=await app.inject({method:"GET",url:`/mock-abdm/records/timeline?patientId=${patient.patient.patientId}&consentGrantId=123e4567-e89b-42d3-a456-426614174099`,headers:authHeader(providerToken)});assert.equal(before.statusCode,403,before.payload);
  const now=new Date();const requested=await app.inject({method:"POST",url:"/mock-abdm/consents",headers:authHeader(providerToken),payload:{patientId:patient.patient.patientId,purpose:"Integration test continuity",hiTypes:["WELLNESS_RECORD","DIAGNOSTIC_REPORT"],dateFrom:new Date(now.getTime()-365*86_400_000).toISOString(),dateTo:now.toISOString(),validUntil:new Date(now.getTime()+7*86_400_000).toISOString()}});assert.equal(requested.statusCode,201,requested.payload);requestId=body<{data:{consentRequestId:string}}>(requested).data.consentRequestId;
  const approved=await app.inject({method:"POST",url:`/mock-abdm/patient/consents/${requestId}/decision`,headers:authHeader(patient.accessToken),payload:{decision:"APPROVE",approvedHiTypes:["WELLNESS_RECORD"]}});assert.equal(approved.statusCode,200,approved.payload);grantId=body<{data:{consentGrantId:string}}>(approved).data.consentGrantId;
  const timeline=await app.inject({method:"GET",url:`/mock-abdm/records/timeline?patientId=${patient.patient.patientId}&consentGrantId=${grantId}`,headers:authHeader(providerToken)});assert.equal(timeline.statusCode,200,timeline.payload);const records=body<{data:{records:Array<{recordType:string}>}}>(timeline).data.records;assert.ok(records.length>0);assert.ok(records.every(record=>record.recordType==="WELLNESS_RECORD"));
  const packet=await app.inject({method:"POST",url:"/provider/care-packets",headers:authHeader(providerToken),payload:{patientId:patient.patient.patientId,consentGrantId:grantId}});assert.equal(packet.statusCode,201,packet.payload);assert.match(body<{data:{mockNotice:string}}>(packet).data.mockNotice,/not NHA certified/);
  const audit=await app.inject({method:"GET",url:"/mock-abdm/patient/access-history",headers:authHeader(patient.accessToken)});assert.equal(audit.statusCode,200,audit.payload);assert.ok(body<{data:unknown[]}>(audit).data.length>=2);
 }finally{if(grantId){await pool.query("DELETE FROM abdm_care_packets WHERE consent_grant_id=$1",[grantId]);await pool.query("DELETE FROM abdm_record_access_audit WHERE consent_grant_id=$1",[grantId]);}if(requestId)await pool.query("DELETE FROM abdm_consent_requests WHERE consent_request_id=$1",[requestId]);}
});
