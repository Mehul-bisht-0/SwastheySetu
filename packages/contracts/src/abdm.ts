import { z } from "zod";
import { isoDateTime, uuid } from "./common.ts";

export const MOCK_ABDM_LABEL = "ABDM development mock—not NHA certified";
export const ABDM_FHIR_VERSION = "6.5.0";

export const providerRole = z.enum([
  "DOCTOR", "NURSE", "LAB_TECH", "RECORDS_OFFICER", "FACILITY_ADMIN",
]);
export const healthInformationType = z.enum([
  "OP_CONSULTATION", "PRESCRIPTION", "DIAGNOSTIC_REPORT", "DISCHARGE_SUMMARY",
  "IMMUNIZATION_RECORD", "WELLNESS_RECORD", "HEALTH_DOCUMENT", "INVOICE_RECORD",
]);
export const consentStatus = z.enum(["REQUESTED", "GRANTED", "DENIED", "REVOKED", "EXPIRED"]);
export const referralStatus = z.enum([
  "CREATED", "ACCEPTED", "SCHEDULED", "ARRIVED", "COMPLETED", "DECLINED", "CANCELLED",
]);

export const providerLoginRequest = z.object({
  phone: z.string().trim().regex(/^\+91[6-9]\d{9}$/),
  password: z.string().min(8).max(128),
  facilityId: uuid.optional(),
});
export const providerSession = z.object({
  accessToken: z.string().min(32),
  expiresAt: isoDateTime,
  provider: z.object({
    accountId: uuid,
    practitionerId: uuid,
    hprId: z.string(),
    fullName: z.string(),
    qualification: z.string(),
    specialty: z.string(),
    facilityId: uuid,
    facilityName: z.string(),
    hfrId: z.string(),
    districtCode: z.string(),
    role: providerRole,
  }),
  mockNotice: z.literal(MOCK_ABDM_LABEL),
});

export const registryFacility = z.object({
  facilityId: uuid, hfrId: z.string(), name: z.string(), facilityType: z.string(), districtCode: z.string(),
});
export const registryPractitioner = z.object({
  practitionerId: uuid, hprId: z.string(), fullName: z.string(), qualification: z.string(), specialty: z.string(),
  facilities: z.array(z.object({ facilityId: uuid, name: z.string(), role: providerRole })),
});

export const patientLookupRequest = z.object({ identifier: z.string().trim().min(5).max(100) });
export const patientLookup = z.object({
  patientId: uuid,
  identifierMasked: z.string(),
  displayName: z.string(),
});

const hiTypes = z.array(healthInformationType).min(1).max(8).refine((values) => new Set(values).size === values.length, "record types must be unique");
export const createConsentRequest = z.object({
  patientId: uuid,
  purpose: z.string().trim().min(3).max(240),
  hiTypes,
  dateFrom: isoDateTime,
  dateTo: isoDateTime,
  validUntil: isoDateTime,
  referralId: uuid.optional(),
}).superRefine((value, ctx) => {
  const now = Date.now();
  const until = Date.parse(value.validUntil);
  if (Date.parse(value.dateFrom) > Date.parse(value.dateTo)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateFrom"], message: "must not be after dateTo" });
  if (until <= now) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "must be in the future" });
  if (until > now + 30 * 86_400_000) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "routine consent is capped at 30 days" });
});

export const decideConsentRequest = z.object({
  decision: z.enum(["APPROVE", "DENY"]),
  approvedHiTypes: hiTypes.optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "APPROVE" && !value.approvedHiTypes) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedHiTypes"], message: "select at least one record type" });
  if (value.decision === "DENY" && value.approvedHiTypes) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedHiTypes"], message: "must be omitted when denying" });
});

export const consentRequestView = z.object({
  consentRequestId: uuid,
  patientId: uuid,
  requestingFacility: z.object({ facilityId: uuid, name: z.string(), hfrId: z.string() }),
  requestingPractitioner: z.object({ practitionerId: uuid, fullName: z.string(), hprId: z.string() }),
  purpose: z.string(), requestedHiTypes: hiTypes, approvedHiTypes: z.array(healthInformationType),
  dateFrom: isoDateTime, dateTo: isoDateTime, validFrom: isoDateTime.nullable(), validUntil: isoDateTime,
  status: consentStatus, referralId: uuid.nullable(), createdAt: isoDateTime,
  consentGrantId: uuid.nullable(),
  explanation: z.object({ en: z.string(), hi: z.string(), mr: z.string() }),
});

export const fhirBundle = z.object({
  resourceType: z.literal("Bundle"),
  type: z.literal("document"),
  meta: z.object({ profile: z.array(z.string().url()).min(1) }).passthrough(),
  entry: z.array(z.object({ resource: z.record(z.unknown()) }).passthrough()).min(2),
}).passthrough();

export const createRecordRequest = z.object({
  operationId: uuid,
  patientId: uuid,
  careContextId: uuid.optional(),
  sourceReferralId: uuid.optional(),
  recordType: healthInformationType,
  title: z.string().trim().min(3).max(200),
  authoredAt: isoDateTime,
  summary: z.record(z.unknown()),
  fhirBundle,
});
export const healthRecordView = z.object({
  recordId: uuid, patientId: uuid, careContextId: uuid, recordType: healthInformationType,
  title: z.string(), authoredAt: isoDateTime, sourceFacility: z.object({ facilityId: uuid, name: z.string(), hfrId: z.string() }),
  authorName: z.string(), profileUrl: z.string().url(), fhirVersion: z.literal(ABDM_FHIR_VERSION),
  summary: z.record(z.unknown()), fhirBundle: fhirBundle.optional(),
});
export const timeline = z.object({
  records: z.array(healthRecordView),
  consentGrantId: uuid.nullable(),
  mockNotice: z.literal(MOCK_ABDM_LABEL),
});

export const createCarePacketRequest = z.object({ patientId: uuid, consentGrantId: uuid });
export const carePacket = z.object({
  packetId: uuid, patientId: uuid, consentGrantId: uuid, createdAt: isoDateTime, expiresAt: isoDateTime,
  manifest: z.object({ recordIds: z.array(uuid), sourceUpdatedAt: isoDateTime, fhirVersion: z.literal(ABDM_FHIR_VERSION) }),
  records: z.array(healthRecordView), signature: z.string(), mockNotice: z.literal(MOCK_ABDM_LABEL),
});

export const createReferralRequest = z.object({
  operationId: uuid, patientId: uuid, receivingFacilityId: uuid,
  reason: z.string().trim().min(3).max(500),
  priority: z.enum(["ROUTINE", "URGENT"]),
  requestedService: z.string().trim().min(2).max(160),
  sharedHiTypes: hiTypes,
  expectedArrivalAt: isoDateTime.optional(),
});
export const transitionReferralRequest = z.object({
  operationId: uuid,
  status: referralStatus,
  scheduledAt: isoDateTime.optional(), outcome: z.string().trim().max(1000).optional(),
  followUp: z.string().trim().max(1000).optional(),
});
export const referralView = z.object({
  referralId: uuid, patientId: uuid, originFacilityId: uuid, receivingFacilityId: uuid,
  reason: z.string(), priority: z.enum(["ROUTINE", "URGENT"]), requestedService: z.string(),
  status: referralStatus, consentGrantId: uuid.nullable(), expectedArrivalAt: isoDateTime.nullable(),
  scheduledAt: isoDateTime.nullable(), outcome: z.string().nullable(), followUp: z.string().nullable(),
  createdAt: isoDateTime, updatedAt: isoDateTime,
});

export type ProviderRole = z.infer<typeof providerRole>;
export type HealthInformationType = z.infer<typeof healthInformationType>;
export type ProviderSession = z.infer<typeof providerSession>;
export type ConsentRequestView = z.infer<typeof consentRequestView>;
export type HealthRecordView = z.infer<typeof healthRecordView>;
export type ReferralView = z.infer<typeof referralView>;
