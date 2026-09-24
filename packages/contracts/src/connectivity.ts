import { z } from "zod";
import {
  createRecordRequest,
  createReferralRequest,
  fhirBundle,
  healthInformationType,
  referralStatus,
} from "./abdm.ts";
import {
  createServiceEvidenceRequest,
  diagnosticAppointmentStatus,
  diagnosticOrderStatus,
  specimenStatus,
} from "./diagnostics.ts";
import { isoDateTime, uuid } from "./common.ts";

export const connectivityState=z.enum(["OFFLINE","LIMITED","ONLINE"]);
export const operationResult=z.object({operationId:uuid,status:z.enum(["APPLIED","DUPLICATE","CONFLICT","REJECTED"]),serverId:z.string().optional(),message:z.string().optional()});

const envelope=<T extends z.ZodTypeAny,L extends string>(opType:L,payload:T)=>z.object({operationId:uuid,opType:z.literal(opType),clientCreatedAt:isoDateTime,entityVersion:z.number().int().min(1).optional(),payload});
export const providerOperation=z.discriminatedUnion("opType",[
  envelope("PROVIDER_RECORD_PUBLISH",createRecordRequest.omit({operationId:true})),
  envelope("REFERRAL_CREATE",createReferralRequest.omit({operationId:true})),
  envelope("REFERRAL_TRANSITION",z.object({
    referralId:uuid,status:referralStatus,scheduledAt:isoDateTime.optional(),
    outcome:z.string().trim().max(1000).optional(),followUp:z.string().trim().max(1000).optional(),
  })),
  envelope("DIAGNOSTIC_ORDER_CREATE",z.object({
    patientId:uuid,serviceId:uuid,priority:z.enum(["ROUTINE","URGENT"]),
    practitionerReason:z.string().trim().min(3).max(500),requestedWindowStart:isoDateTime.optional(),
    requestedWindowEnd:isoDateTime.optional(),sharedHiTypes:z.array(healthInformationType).min(1).max(8),
    serviceRequest:z.record(z.unknown()),
  })),
  envelope("DIAGNOSTIC_ORDER_TRANSITION",z.object({
    orderId:uuid,status:diagnosticOrderStatus,scheduledAt:isoDateTime.optional(),note:z.string().trim().max(1000).optional(),
  })),
  envelope("DIAGNOSTIC_SPECIMEN_TRANSITION",z.object({
    orderId:uuid,status:specimenStatus,occurredAt:isoDateTime,note:z.string().trim().max(500).optional(),
  })),
  envelope("DIAGNOSTIC_APPOINTMENT_TRANSITION",z.object({
    orderId:uuid,status:diagnosticAppointmentStatus,scheduledAt:isoDateTime.optional(),note:z.string().trim().max(500).optional(),
  })),
  envelope("DIAGNOSTIC_RESULT_PUBLISH",z.object({orderId:uuid,summary:z.record(z.unknown()),fhirBundle})),
  envelope("DIAGNOSTIC_SERVICE_SIGNAL_CREATE",createServiceEvidenceRequest.omit({operationId:true})),
]).superRefine((operation,ctx)=>{
  if(operation.opType==="DIAGNOSTIC_ORDER_CREATE"&&operation.payload.requestedWindowStart&&operation.payload.requestedWindowEnd&&Date.parse(operation.payload.requestedWindowStart)>Date.parse(operation.payload.requestedWindowEnd))ctx.addIssue({code:z.ZodIssueCode.custom,path:["payload","requestedWindowStart"],message:"must not be after requestedWindowEnd"});
});
export const patientOperation=z.discriminatedUnion("opType",[
  envelope("CONSENT_DECIDE",z.object({
    consentRequestId:uuid,decision:z.enum(["APPROVE","DENY"]),approvedHiTypes:z.array(healthInformationType).min(1).max(8).optional(),
  })),
  envelope("CONSENT_REVOKE",z.object({consentRequestId:uuid})),
  envelope("CARE_CONTEXT_LINK",z.object({careContextId:uuid})),
]).superRefine((operation,ctx)=>{
  if(operation.opType!=="CONSENT_DECIDE")return;
  if(operation.payload.decision==="APPROVE"&&!operation.payload.approvedHiTypes)ctx.addIssue({code:z.ZodIssueCode.custom,path:["payload","approvedHiTypes"],message:"select at least one record type"});
  if(operation.payload.decision==="DENY"&&operation.payload.approvedHiTypes)ctx.addIssue({code:z.ZodIssueCode.custom,path:["payload","approvedHiTypes"],message:"must be omitted when denying"});
});
export const ashaDiagnosticOperation=envelope("DIAGNOSTIC_SERVICE_SIGNAL_CREATE",createServiceEvidenceRequest.omit({operationId:true}));
export const providerPushRequest=z.object({operations:z.array(providerOperation).min(1).max(50)});
export const patientPushRequest=z.object({operations:z.array(patientOperation).min(1).max(50)});
export const ashaDiagnosticPushRequest=z.object({operations:z.array(ashaDiagnosticOperation).min(1).max(50)});
export const pushResponse=z.object({results:z.array(operationResult),serverTime:isoDateTime});

export type ProviderOperation=z.infer<typeof providerOperation>;
export type PatientOperation=z.infer<typeof patientOperation>;
export type OperationResult=z.infer<typeof operationResult>;
