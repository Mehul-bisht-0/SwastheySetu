import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as connectivity from "@swasthyasetu/contracts/connectivity";
import * as diagnostics from "@swasthyasetu/contracts/diagnostics";
import { testApp } from "./helpers.ts";

const operationId="123e4567-e89b-42d3-a456-426614174000";
const id="223e4567-e89b-42d3-a456-426614174000";
const now="2026-09-24T10:00:00.000Z";

test("diagnostic search requires an exact code and never supplies a generic fallback",()=>{
 const parsed=diagnostics.diagnosticSearchQuery.parse({code:"CBC",districtCode:"227"});
 assert.equal(parsed.code,"CBC");
 assert.equal("fallback" in parsed,false);
 assert.throws(()=>diagnostics.diagnosticSearchQuery.parse({code:"",districtCode:"227"}));
});

test("offline patient approval requires an explicit non-empty scope",()=>{
 const base={operationId,opType:"CONSENT_DECIDE" as const,clientCreatedAt:now,payload:{consentRequestId:id,decision:"APPROVE" as const}};
 assert.equal(connectivity.patientOperation.safeParse(base).success,false);
 assert.equal(connectivity.patientOperation.safeParse({...base,payload:{...base.payload,approvedHiTypes:["DIAGNOSTIC_REPORT"]}}).success,true);
});

test("queued diagnostic orders reject an inverted appointment window",()=>{
 const parsed=connectivity.providerOperation.safeParse({operationId,opType:"DIAGNOSTIC_ORDER_CREATE",clientCreatedAt:now,payload:{patientId:id,serviceId:id,priority:"ROUTINE",practitionerReason:"Clinician-entered reason",requestedWindowStart:"2026-10-02T00:00:00.000Z",requestedWindowEnd:"2026-10-01T00:00:00.000Z",sharedHiTypes:["OP_CONSULTATION"],serviceRequest:{resourceType:"ServiceRequest"}}});
 assert.equal(parsed.success,false);
});

test("provider service worker caches only shell assets and the explicit public reference route",async()=>{
 const source=await readFile(path.resolve(process.cwd(),"../provider-web/public/sw.js"),"utf8");
 assert.match(source,/request\.headers\.has\("authorization"\)/);
 assert.match(source,/url\.pathname==="\/diagnostics\/reference"/);
 assert.doesNotMatch(source,/diagnostic-orders|mock-abdm|care-packets|patients\/diagnostics/);
});

test("diagnostic patient, provider and ASHA write routes require their scoped identities",async()=>{
 const app=await testApp();
 const provider=await app.inject({method:"GET",url:"/provider/diagnostic-orders/"});
 const patient=await app.inject({method:"GET",url:"/patients/diagnostics/"});
 const asha=await app.inject({method:"POST",url:"/diagnostics/signals/push",payload:{operations:[]}});
 assert.equal(provider.statusCode,401);
 assert.equal(patient.statusCode,401);
 assert.equal(asha.statusCode,401);
});
