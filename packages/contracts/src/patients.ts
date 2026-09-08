import { z } from "zod";
import { deviceId, districtCode, isoDateTime, latitude, longitude, uuid } from "./common.ts";
import { patientContext, symptomCode } from "./triage.ts";

export const patientPhone = z.string().trim().regex(/^\+91[6-9]\d{9}$/, "expected +91 followed by a 10-digit mobile number");
export const verificationStatus = z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"]);
export const verificationMethod = z.enum(["AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS"]);

const password = z.string().min(8).max(128);
const clientIdentity = {
  deviceId,
  platform: z.enum(["android", "ios", "unknown"]).default("unknown"),
  appVersion: z.string().max(32).default("0.0.0"),
};

export const registerRequest = z.object({
  phone: patientPhone,
  password,
  fullName: z.string().trim().min(2).max(120),
  districtCode,
  homeAddress: z.string().trim().min(5).max(500),
  ...clientIdentity,
});

export const loginRequest = z.object({ phone: patientPhone, password, ...clientIdentity });

export const patientProfile = z.object({
  patientId: uuid,
  phone: patientPhone,
  fullName: z.string(),
  districtCode,
  homeAddress: z.string(),
  verificationStatus,
  verifiedAt: isoDateTime.nullable(),
});

export const authResponse = z.object({
  accessToken: z.string(),
  expiresAt: isoDateTime,
  patient: patientProfile,
});

export const startVerificationRequest = z.object({
  method: verificationMethod.default("AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS"),
  consent: z.literal(true),
});

export const verificationSession = z.object({
  verificationSessionId: uuid,
  method: verificationMethod,
  provider: z.string(),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "EXPIRED"]),
  uploadMode: z.enum(["PROVIDER_REDIRECT", "DEVELOPMENT_MOCK"]),
  uploadUrl: z.string().url().nullable(),
  createdAt: isoDateTime,
});

export const completeMockVerificationRequest = z.object({ verificationSessionId: uuid });

export const abhaIdentifier = z.string().trim().min(5).max(100).regex(
  /^(?:\d{2}-?\d{4}-?\d{4}-?\d{4}|[A-Za-z0-9._-]{3,64}@[A-Za-z0-9.-]{2,64})$/,
  "enter a 14-digit ABHA number or ABHA address",
);
export const abhaLinkStatusValue = z.enum(["PENDING", "LINKED", "REJECTED", "EXPIRED", "REVOKED"]);
export const startAbhaLinkRequest = z.object({ identifier: abhaIdentifier, consent: z.literal(true) });
export const abhaLinkSession = z.object({
  abhaLinkSessionId: uuid,
  provider: z.string(),
  identifierMasked: z.string(),
  status: abhaLinkStatusValue,
  linkMode: z.enum(["ABDM_REDIRECT", "DEVELOPMENT_MOCK"]),
  authorizationUrl: z.string().url().nullable(),
  createdAt: isoDateTime,
});
export const bloodGroup = z.enum(["A+","A-","B+","B-","AB+","AB-","O+","O-","UNKNOWN"]);
const emergencyList = z.array(z.string().trim().min(1).max(120)).max(20);
export const completeMockAbhaLinkRequest = z.object({
  abhaLinkSessionId: uuid,
  summary: z.object({
    bloodGroup: bloodGroup.nullable(),
    allergies: emergencyList,
    medications: emergencyList,
    conditions: emergencyList,
  }),
});
export const abhaLinkStatus = z.object({
  linked: z.boolean(),
  identifierMasked: z.string().nullable(),
  summaryAvailable: z.boolean(),
  summaryValidUntil: isoDateTime.nullable(),
  source: z.string().nullable(),
});
export const emergencyClinicalSummary = z.object({
  source: z.string(),
  bloodGroup: bloodGroup.nullable(),
  allergies: z.array(z.string()),
  medications: z.array(z.string()),
  conditions: z.array(z.string()),
  recordCount: z.number().int().nonnegative(),
  sourceUpdatedAt: isoDateTime.nullable(),
  fetchedAt: isoDateTime,
  consentValidUntil: isoDateTime,
  caution: z.string(),
});

export const emergencyType = z.enum(["MEDICAL", "ACCIDENT", "PREGNANCY", "OTHER"]);
export const emergencyStatus = z.enum([
  "DISPATCH_PENDING", "FACILITY_NOTIFIED", "ACCEPTED", "AMBULANCE_DISPATCHED", "ARRIVED",
  "COMPLETED", "DECLINED", "CANCELLED", "FAILED",
]);

export const sharedEmergencyTriageContext = z.object({
  reportId: uuid,
  tier: z.enum(["EMERGENCY", "GO_NOW"]),
  decisionSource: z.enum(["RED_FLAG", "CLASSIFIER"]),
  patient: patientContext,
  symptoms: z.array(symptomCode).max(20),
  redFlagLabels: z.array(z.string().trim().min(1).max(200)).max(20),
  rulesetVersion: z.string().trim().min(1).max(80),
  evaluatedAt: isoDateTime,
  disclaimer: z.string().trim().min(1).max(500),
});

export const createEmergencyRequest = z.object({
  emergencyType: emergencyType.default("MEDICAL"),
  latitude,
  longitude,
  address: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(500).optional(),
  consentToShareLocation: z.literal(true),
  consentToShareHealthSummary: z.boolean().default(false),
  consentToShareTriageContext: z.boolean().default(false),
  triageContext: sharedEmergencyTriageContext.optional(),
}).superRefine((value, ctx) => {
  if (value.consentToShareTriageContext !== (value.triageContext !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consentToShareTriageContext"],
      message: "triage context and its sharing consent must be provided together",
    });
  }
});

export const emergency = z.object({
  emergencyId: uuid,
  status: emergencyStatus,
  requestedAt: isoDateTime,
  updatedAt: isoDateTime,
  clinicalSummaryShared: z.boolean(),
  triageContextShared: z.boolean(),
  facility: z.object({
    facilityId: uuid,
    name: z.string(),
    phone: z.string().nullable(),
    distanceMeters: z.number().int().nonnegative(),
  }),
});

export const dispatcherStatusRequest = z.object({
  status: z.enum(["FACILITY_NOTIFIED", "ACCEPTED", "AMBULANCE_DISPATCHED", "ARRIVED", "COMPLETED", "DECLINED", "FAILED"]),
  note: z.string().trim().max(500).optional(),
});

export const dispatcherEmergency = emergency.extend({
  emergencyType,
  patient: z.object({ fullName: z.string(), phone: patientPhone }),
  location: z.object({ latitude, longitude, address: z.string() }),
  notes: z.string().nullable(),
  triageContext: sharedEmergencyTriageContext.nullable(),
  notification: z.object({
    notificationId: uuid,
    channel: z.enum(["FACILITY_WEBHOOK", "SMS", "VOICE"]),
    deliveryStatus: z.enum(["PENDING", "SENT", "FAILED"]),
    createdAt: isoDateTime,
  }).nullable(),
  clinicalSummary: emergencyClinicalSummary.nullable(),
});

export const dispatcherQueue = z.object({ items: z.array(dispatcherEmergency) });

export type RegisterRequest = z.infer<typeof registerRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type PatientProfile = z.infer<typeof patientProfile>;
export type Emergency = z.infer<typeof emergency>;
