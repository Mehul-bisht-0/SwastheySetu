import { randomUUID } from "node:crypto";
import { abdm } from "@swasthyasetu/contracts";
import { badRequest, conflict, forbidden, notFound } from "../../plugins/errors.ts";
import { sha256 } from "../../util/hash.ts";
import type { ProviderActor } from "../provider-auth/repo.ts";
import * as repo from "./repo.ts";

const NEXT:Record<string,readonly string[]>={CREATED:["ACCEPTED","DECLINED","CANCELLED"],ACCEPTED:["SCHEDULED","DECLINED","CANCELLED"],SCHEDULED:["ARRIVED","CANCELLED"],ARRIVED:["COMPLETED"]};
function view(r:repo.ReferralRow){return abdm.referralView.parse({referralId:r.referral_id,patientId:r.patient_id,originFacilityId:r.origin_facility_id,receivingFacilityId:r.receiving_facility_id,reason:r.reason,priority:r.priority,requestedService:r.requested_service,status:r.status,consentGrantId:r.consent_grant_id,expectedArrivalAt:r.expected_arrival_at?.toISOString()??null,scheduledAt:r.scheduled_at?.toISOString()??null,outcome:r.outcome,followUp:r.follow_up,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});}
export async function createReferral(actor:ProviderActor,input:ReturnType<typeof abdm.createReferralRequest.parse>){
 if(actor.role!=="DOCTOR")throw forbidden("Only a doctor can create a referral.");if(input.receivingFacilityId===actor.facility_id)throw badRequest("Choose another receiving facility.");
 const payloadHash=sha256(JSON.stringify(input));const prior=await repo.findOperation(input.operationId);if(prior){if(prior.payload_hash!==payloadHash)throw conflict("Operation id was reused with different content.");const replay=await repo.findReferral(String(prior.result["referralId"]));if(!replay)throw notFound("Referral not found.");return view(replay);}
 const referralId=randomUUID();const now=new Date();const created=await repo.insertReferral({referralId,operationId:input.operationId,accountId:actor.provider_account_id,patientId:input.patientId,originFacilityId:actor.facility_id,receivingFacilityId:input.receivingFacilityId,practitionerId:actor.practitioner_id,reason:input.reason,priority:input.priority,service:input.requestedService,expected:input.expectedArrivalAt,payloadHash,consent:{types:input.sharedHiTypes,dateFrom:new Date(now.getTime()-5*365*86_400_000).toISOString(),dateTo:now.toISOString(),validUntil:new Date(now.getTime()+7*86_400_000).toISOString(),explanation:{en:`Share selected records with the receiving facility for ${input.requestedService}.`,hi:`${input.requestedService} के लिए चुने हुए रिकॉर्ड प्राप्त करने वाले अस्पताल से साझा करें।`,mr:`${input.requestedService} साठी निवडक नोंदी स्वीकारणाऱ्या रुग्णालयासोबत शेअर करा.`}}});return view(created);
}
export async function listReferrals(actor:ProviderActor){return(await repo.listForFacility(actor.facility_id)).map(view);}
export async function patientReferrals(patientId:string){return(await repo.listForPatient(patientId)).map(view);}
export async function transitionReferral(actor:ProviderActor,id:string,input:ReturnType<typeof abdm.transitionReferralRequest.parse>){
 const payloadHash=sha256(JSON.stringify({id,...input}));const prior=await repo.findOperation(input.operationId);if(prior){if(prior.payload_hash!==payloadHash)throw conflict("Operation id was reused with different content.");const replay=await repo.findReferral(String(prior.result["referralId"]));if(!replay)throw notFound("Referral not found.");return view(replay);}
 const row=await repo.findReferral(id);if(!row)throw notFound("Referral not found.");
 const receiving=row.receiving_facility_id===actor.facility_id;const origin=row.origin_facility_id===actor.facility_id;if(!receiving&&!origin)throw forbidden();
 if(receiving&&input.status!=="DECLINED"&&input.status!=="CANCELLED"&&!row.consent_grant_id){const grant=await repo.attachActiveReferralGrant(id,actor.facility_id);if(!grant)throw forbidden("Patient consent is required before the receiving facility can accept this referral.");row.consent_grant_id=grant;}
 if(input.status==="CANCELLED"&&!origin)throw forbidden("Only the referring facility may cancel.");if(input.status!=="CANCELLED"&&!receiving)throw forbidden("Only the receiving facility may progress this referral.");
 if(!(NEXT[row.status]??[]).includes(input.status))throw conflict(`Referral cannot move from ${row.status} to ${input.status}.`);
 if(input.status==="SCHEDULED"&&!input.scheduledAt)throw badRequest("A scheduled referral needs a date and time.");if(input.status==="COMPLETED"&&!input.outcome)throw badRequest("A completed referral needs an outcome.");
 const changed=await repo.transition(id,actor.practitioner_id,actor.provider_account_id,input.operationId,payloadHash,row.status,input.status,input);if(!changed)throw conflict("Referral changed before this update was applied.");return view(changed);
}
