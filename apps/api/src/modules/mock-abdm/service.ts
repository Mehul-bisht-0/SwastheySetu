import { createHmac, randomUUID } from "node:crypto";
import { abdm } from "@swasthyasetu/contracts";
import { config } from "../../config.ts";
import { badRequest, conflict, forbidden, notFound } from "../../plugins/errors.ts";
import { sha256 } from "../../util/hash.ts";
import { canPublish, canReadClinical } from "../provider-auth/service.ts";
import type { ProviderActor } from "../provider-auth/repo.ts";
import * as repo from "./repo.ts";

const PROFILE: Record<ReturnType<typeof abdm.healthInformationType.parse>, string> = {
  OP_CONSULTATION: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord",
  PRESCRIPTION: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord",
  DIAGNOSTIC_REPORT: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord",
  DISCHARGE_SUMMARY: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummaryRecord",
  IMMUNIZATION_RECORD: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/ImmunizationRecord",
  WELLNESS_RECORD: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord",
  HEALTH_DOCUMENT: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/HealthDocumentRecord",
  INVOICE_RECORD: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/InvoiceRecord",
};

function normalizeIdentifier(value:string):string{return value.includes("@")?value.toLowerCase():value.replace(/-/g,"");}
function iso(value:Date):string{return value.toISOString();}
function explanation(actor:ProviderActor,purpose:string){return{
  en:`${actor.full_name} at ${actor.facility_name} requests records for: ${purpose}`,
  hi:`${actor.facility_name} के ${actor.full_name} इस कारण रिकॉर्ड माँग रहे हैं: ${purpose}`,
  mr:`${actor.facility_name} येथील ${actor.full_name} या कारणासाठी नोंदी मागत आहेत: ${purpose}`,
};}
function consentView(row:repo.ConsentRow){return abdm.consentRequestView.parse({
  consentRequestId:row.consent_request_id,
  patientId:row.patient_id,
  requestingFacility:{facilityId:row.facility_id,name:row.facility_name,hfrId:row.hfr_id},
  requestingPractitioner:{practitionerId:row.practitioner_id,fullName:row.practitioner_name,hprId:row.hpr_id},
  purpose:row.purpose,requestedHiTypes:row.requested_hi_types,approvedHiTypes:row.approved_hi_types??[],
  dateFrom:iso(row.date_from),dateTo:iso(row.date_to),validFrom:row.valid_from?iso(row.valid_from):null,
  validUntil:iso(row.valid_until),status:row.status,referralId:row.referral_id,createdAt:iso(row.created_at),
  consentGrantId:row.consent_grant_id,
  explanation:row.explanation,
});}
function recordView(row:repo.RecordRow,includeBundle:boolean){return abdm.healthRecordView.parse({
  recordId:row.record_id,patientId:row.patient_id,careContextId:row.care_context_id,recordType:row.record_type,
  title:row.title,authoredAt:iso(row.authored_at),sourceFacility:{facilityId:row.facility_id,name:row.facility_name,hfrId:row.hfr_id},
  authorName:row.author_name,profileUrl:row.profile_url,fhirVersion:row.fhir_version,summary:row.summary,
  ...(includeBundle?{fhirBundle:row.fhir_bundle}:{}),
});}

export async function listRegistry(){
  const [facilities,rows]=await Promise.all([repo.registryFacilities(),repo.registryPractitioners()]);
  const practitioners=new Map<string,{practitionerId:string;hprId:string;fullName:string;qualification:string;specialty:string;facilities:Array<{facilityId:string;name:string;role:string}>}>();
  for(const row of rows){const current=practitioners.get(row.practitioner_id)??{practitionerId:row.practitioner_id,hprId:row.hpr_id,fullName:row.full_name,qualification:row.qualification,specialty:row.specialty,facilities:[]};current.facilities.push({facilityId:row.facility_id,name:row.facility_name,role:row.role});practitioners.set(row.practitioner_id,current);}
  return {mockNotice:abdm.MOCK_ABDM_LABEL,facilities:facilities.map(f=>({facilityId:f.facility_id,hfrId:f.hfr_id,name:f.name,facilityType:f.facility_type,districtCode:f.district_code})),practitioners:[...practitioners.values()]};
}
export async function lookupPatient(identifier:string){const row=await repo.patientByIdentifierHash(sha256(normalizeIdentifier(identifier)));if(!row)throw notFound("No active mock ABHA profile matches that identifier.");return{patientId:row.patient_id,identifierMasked:row.identifier_masked,displayName:row.full_name};}
export async function requestConsent(actor:ProviderActor,input:ReturnType<typeof abdm.createConsentRequest.parse>){
  if(!canReadClinical(actor))throw forbidden("This provider role cannot request clinical records.");
  if(!await repo.patientExists(input.patientId))throw notFound("Mock ABHA patient not found.");
  return consentView(await repo.createConsent({patientId:input.patientId,facilityId:actor.facility_id,practitionerId:actor.practitioner_id,purpose:input.purpose,types:input.hiTypes,dateFrom:input.dateFrom,dateTo:input.dateTo,validUntil:input.validUntil,referralId:input.referralId,explanation:explanation(actor,input.purpose)}));
}
export async function listPatientConsents(patientId:string){return Promise.all((await repo.patientConsents(patientId)).map(consentView));}
export async function listProviderConsents(actor:ProviderActor){return Promise.all((await repo.providerConsents(actor.facility_id)).map(consentView));}
export async function decideConsent(patientId:string,id:string,input:ReturnType<typeof abdm.decideConsentRequest.parse>){
  const row=await repo.findConsent(id);if(!row||row.patient_id!==patientId)throw notFound("Consent request not found.");
  if(row.status!=="REQUESTED")throw conflict("Consent request is no longer pending.");
  const types=input.approvedHiTypes??[];
  if(types.some(t=>!row.requested_hi_types.includes(t)))throw badRequest("Approved record types must be a subset of the request.");
  const decided=await repo.decideConsent(id,patientId,input.decision==="APPROVE",types);if(!decided)throw conflict("Consent request changed before it could be decided.");return consentView(decided);
}
export async function revokeConsent(patientId:string,id:string){const row=await repo.revokeConsent(id,patientId);if(!row)throw conflict("Only an active grant can be revoked.");return consentView(row);}
async function authorize(actor:ProviderActor,patientId:string,grantId:string){if(!canReadClinical(actor))throw forbidden("This provider role cannot read clinical records.");const grant=await repo.activeGrant(grantId,patientId,actor.facility_id);if(!grant)throw forbidden("An active patient consent grant is required.");return grant;}
export async function providerTimeline(actor:ProviderActor,patientId:string,grantId:string,includeBundle=false){const grant=await authorize(actor,patientId,grantId);const rows=await repo.recordsForGrant(grant);await repo.auditAccess({patientId,practitionerId:actor.practitioner_id,facilityId:actor.facility_id,grantId,purpose:grant.purpose,action:"TIMELINE_READ",recordIds:rows.map(r=>r.record_id)});return abdm.timeline.parse({records:rows.map(r=>recordView(r,includeBundle)),consentGrantId:grantId,mockNotice:abdm.MOCK_ABDM_LABEL});}
export async function ownTimeline(patientId:string){const rows=await repo.patientRecords(patientId);return abdm.timeline.parse({records:rows.map(r=>recordView(r,false)),consentGrantId:null,mockNotice:abdm.MOCK_ABDM_LABEL});}
export async function contexts(patientId:string){return(await repo.patientContexts(patientId)).map(row=>({careContextId:row.care_context_id,display:row.display,status:row.link_status,facility:{facilityId:row.facility_id,name:row.facility_name,hfrId:row.hfr_id},createdAt:iso(row.created_at)}));}
export async function linkContext(patientId:string,id:string){if(!await repo.linkContext(id,patientId))throw notFound("Care context not found or already linked.");return{careContextId:id,status:"LINKED"};}
function validateBundle(type:ReturnType<typeof abdm.healthInformationType.parse>,bundle:ReturnType<typeof abdm.fhirBundle.parse>):string{
  const profile=PROFILE[type];if(!bundle.meta.profile.includes("https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"))throw badRequest("FHIR Bundle must declare the ABDM DocumentBundle profile.");
  const first=bundle.entry[0]?.resource;if(first?.["resourceType"]!=="Composition")throw badRequest("The first FHIR document entry must be a Composition.");
  const compositionMeta=first["meta"] as {profile?:unknown}|undefined;
  if(!Array.isArray(compositionMeta?.profile)||!compositionMeta.profile.includes(profile))throw badRequest(`Composition must declare ${profile}.`);return profile;
}
export async function publishRecord(actor:ProviderActor,input:ReturnType<typeof abdm.createRecordRequest.parse>){
  if(!canPublish(actor,input.recordType))throw forbidden("Your provider role cannot publish this record type.");
  if(actor.role==="LAB_TECH"&&(!input.sourceReferralId||!await repo.hasDiagnosticAssignment(input.sourceReferralId,input.patientId,actor.facility_id)))throw forbidden("Lab staff may publish results only for an assigned, consented referral at this facility.");
  const profile=validateBundle(input.recordType,input.fhirBundle);
  const payloadHash=sha256(JSON.stringify(input));
  const prior=await repo.findRecordOperation(input.operationId);
  if(prior){if(prior.payload_hash!==payloadHash)throw conflict("Operation id was reused with different content.");return recordView(prior.record,true);}
  const contextId=input.careContextId??(await repo.createCareContext(input.patientId,actor.facility_id,`enc-${input.operationId}`,input.title)).care_context_id;
  const checksum=sha256(JSON.stringify({patientId:input.patientId,contextId,recordType:input.recordType,title:input.title,authoredAt:input.authoredAt,summary:input.summary,bundle:input.fhirBundle}));
  const row=await repo.insertRecord({operationId:input.operationId,accountId:actor.provider_account_id,patientId:input.patientId,careContextId:contextId,facilityId:actor.facility_id,practitionerId:actor.practitioner_id,recordType:input.recordType,title:input.title,authoredAt:input.authoredAt,profileUrl:profile,bundle:input.fhirBundle,summary:input.summary,checksum,payloadHash});return recordView(row,true);
}
export async function createCarePacket(actor:ProviderActor,input:ReturnType<typeof abdm.createCarePacketRequest.parse>){
  const grant=await authorize(actor,input.patientId,input.consentGrantId);const rows=await repo.recordsForGrant(grant);const now=new Date();const expiresAt=new Date(Math.min(grant.valid_until.getTime(),now.getTime()+7*86_400_000));
  const manifest={recordIds:rows.map(r=>r.record_id),sourceUpdatedAt:now.toISOString(),fhirVersion:abdm.ABDM_FHIR_VERSION};
  const signature=createHmac("sha256",config.JWT_SECRET).update(JSON.stringify({patientId:input.patientId,grantId:input.consentGrantId,expiresAt:expiresAt.toISOString(),manifest})).digest("hex");
  const packet=await repo.createPacket({patientId:input.patientId,grantId:input.consentGrantId,facilityId:actor.facility_id,practitionerId:actor.practitioner_id,recordIds:manifest.recordIds,manifest,signature,expiresAt});
  await repo.auditAccess({patientId:input.patientId,practitionerId:actor.practitioner_id,facilityId:actor.facility_id,grantId:input.consentGrantId,purpose:grant.purpose,action:"CARE_PACKET_CREATED",recordIds:manifest.recordIds});
  return abdm.carePacket.parse({packetId:packet.packet_id,patientId:input.patientId,consentGrantId:input.consentGrantId,createdAt:packet.created_at.toISOString(),expiresAt:expiresAt.toISOString(),manifest,records:rows.map(r=>recordView(r,true)),signature,mockNotice:abdm.MOCK_ABDM_LABEL});
}
export async function accessHistory(patientId:string){return(await repo.patientAudit(patientId)).map(row=>({accessEventId:row.access_event_id,practitionerName:row.practitioner_name,facilityName:row.facility_name,purpose:row.purpose,action:row.action,recordIds:row.record_ids,occurredAt:row.occurred_at.toISOString()}));}
