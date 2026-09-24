import { z } from "zod";
import { fhirBundle } from "./abdm.ts";
import { isoDateTime, uuid } from "./common.ts";

export const diagnosticKind = z.enum(["LAB", "IMAGING", "POINT_OF_CARE"]);
export const processingModel = z.enum(["ON_SITE", "HUB"]);
export const diagnosticOrderStatus = z.enum([
  "CREATED", "ACCEPTED", "SCHEDULED", "IN_PROGRESS", "RESULT_READY", "COMPLETED", "DECLINED", "CANCELLED",
]);
export const specimenStatus = z.enum([
  "COLLECTION_PENDING", "COLLECTED", "IN_TRANSIT", "RECEIVED", "REJECTED",
]);
export const diagnosticAppointmentStatus = z.enum(["SCHEDULED", "ARRIVED", "MISSED", "CANCELLED"]);
export const serviceEvidenceType = z.enum([
  "COLLECTION_CONFIRMED", "PROCESSING_CONFIRMED", "REAGENT_CONFIRMED",
  "STOCK_OUT_REPORTED", "MACHINE_DOWN_REPORTED", "COLLECTION_PAUSED_REPORTED",
]);

export const diagnosticTest = z.object({
  testId: uuid,
  codeSystem: z.string().min(1).max(120),
  code: z.string().min(1).max(80),
  display: z.string().min(2).max(200),
  kind: diagnosticKind,
  specimenType: z.string().max(120).nullable(),
  preparation: z.object({ en: z.string(), hi: z.string(), mr: z.string() }),
});

export const facilityDiagnosticService = z.object({
  serviceId: uuid,
  test: diagnosticTest,
  facilityId: uuid,
  facilityName: z.string(),
  districtCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  phone: z.string().nullable(),
  collectionSupported: z.boolean(),
  processingModel,
  processingFacilityId: uuid.nullable(),
  appointmentRequired: z.boolean(),
  turnaroundMinutesMin: z.number().int().min(1),
  turnaroundMinutesMax: z.number().int().min(1),
  indicativeCostPaisaMin: z.number().int().min(0).nullable(),
  indicativeCostPaisaMax: z.number().int().min(0).nullable(),
  supportedSchemes: z.array(z.string()),
  lastPositiveAt: isoDateTime.nullable(),
  lastNegativeAt: isoDateTime.nullable(),
  evidenceText: z.string(),
  distanceMeters: z.number().int().min(0).optional(),
});

export const diagnosticReferenceQuery = z.object({
  districtCode: z.string().min(1).max(32),
  since: isoDateTime.optional(),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export const diagnosticSearchQuery = z.object({
  code: z.string().trim().min(1).max(80),
  districtCode: z.string().min(1).max(32),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).superRefine((value,ctx)=>{
  if((value.latitude===undefined)!==(value.longitude===undefined))ctx.addIssue({code:z.ZodIssueCode.custom,message:"latitude and longitude must be provided together"});
});

export const configureServiceRequest = z.object({
  testId: uuid,
  collectionSupported: z.boolean(),
  processingModel,
  processingFacilityId: uuid.nullable().optional(),
  appointmentRequired: z.boolean(),
  turnaroundMinutesMin: z.number().int().min(1).max(43_200),
  turnaroundMinutesMax: z.number().int().min(1).max(43_200),
  indicativeCostPaisaMin: z.number().int().min(0).max(100_000_000).nullable(),
  indicativeCostPaisaMax: z.number().int().min(0).max(100_000_000).nullable(),
  supportedSchemes: z.array(z.string().trim().min(1).max(120)).max(20),
}).superRefine((value,ctx)=>{
  if(value.turnaroundMinutesMin>value.turnaroundMinutesMax)ctx.addIssue({code:z.ZodIssueCode.custom,path:["turnaroundMinutesMin"],message:"must not exceed maximum"});
  if(value.indicativeCostPaisaMin!==null&&value.indicativeCostPaisaMax!==null&&value.indicativeCostPaisaMin>value.indicativeCostPaisaMax)ctx.addIssue({code:z.ZodIssueCode.custom,path:["indicativeCostPaisaMin"],message:"must not exceed maximum"});
  if(value.processingModel==="HUB"&&!value.processingFacilityId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["processingFacilityId"],message:"required for hub processing"});
});

export const createServiceEvidenceRequest = z.object({
  operationId: uuid,
  serviceId: uuid,
  evidenceType: serviceEvidenceType,
  observedAt: isoDateTime,
  note: z.string().trim().max(500).optional(),
});

export const createDiagnosticOrderRequest = z.object({
  operationId: uuid,
  patientId: uuid,
  serviceId: uuid,
  priority: z.enum(["ROUTINE", "URGENT"]),
  practitionerReason: z.string().trim().min(3).max(500),
  requestedWindowStart: isoDateTime.optional(),
  requestedWindowEnd: isoDateTime.optional(),
  sharedHiTypes: z.array(z.enum(["OP_CONSULTATION","PRESCRIPTION","DIAGNOSTIC_REPORT","DISCHARGE_SUMMARY","IMMUNIZATION_RECORD","WELLNESS_RECORD","HEALTH_DOCUMENT","INVOICE_RECORD"])).min(1).max(8),
  serviceRequest: z.record(z.unknown()),
}).superRefine((value,ctx)=>{
  if(value.requestedWindowStart&&value.requestedWindowEnd&&Date.parse(value.requestedWindowStart)>Date.parse(value.requestedWindowEnd))ctx.addIssue({code:z.ZodIssueCode.custom,path:["requestedWindowStart"],message:"must not be after requestedWindowEnd"});
});

export const transitionDiagnosticOrderRequest = z.object({
  operationId: uuid,
  status: diagnosticOrderStatus,
  scheduledAt: isoDateTime.optional(),
  note: z.string().trim().max(1000).optional(),
});
export const transitionSpecimenRequest = z.object({
  operationId: uuid,
  status: specimenStatus,
  occurredAt: isoDateTime,
  note: z.string().trim().max(500).optional(),
});
export const transitionDiagnosticAppointmentRequest = z.object({
  operationId: uuid,
  status: diagnosticAppointmentStatus,
  scheduledAt: isoDateTime.optional(),
  note: z.string().trim().max(500).optional(),
});
export const publishDiagnosticResultRequest = z.object({
  operationId: uuid,
  summary: z.record(z.unknown()),
  fhirBundle,
});

export const diagnosticOrderView = z.object({
  orderId: uuid,
  trackingCode: z.string().regex(/^D[0-9]{7}$/),
  patientId: uuid.optional(),
  test: diagnosticTest.optional(),
  originFacilityId: uuid,
  destinationFacilityId: uuid,
  destinationFacilityName: z.string().optional(),
  priority: z.enum(["ROUTINE", "URGENT"]).optional(),
  practitionerReason: z.string().optional(),
  status: diagnosticOrderStatus,
  specimenStatus: specimenStatus.nullable(),
  consentStatus: z.enum(["PENDING", "GRANTED", "DENIED", "REVOKED", "EXPIRED"]),
  requestedWindowStart: isoDateTime.nullable().optional(),
  requestedWindowEnd: isoDateTime.nullable().optional(),
  scheduledAt: isoDateTime.nullable(),
  resultRecordId: uuid.nullable(),
  expectedBy: isoDateTime.nullable(),
  overdue: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type DiagnosticKind=z.infer<typeof diagnosticKind>;
export type DiagnosticOrderStatus=z.infer<typeof diagnosticOrderStatus>;
export type SpecimenStatus=z.infer<typeof specimenStatus>;
export type DiagnosticOrderView=z.infer<typeof diagnosticOrderView>;
