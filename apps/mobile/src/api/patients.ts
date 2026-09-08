import { request } from "./client.ts";
import { PATIENT_TOKEN_KEY, type PatientSession } from "../state/patientSession.ts";
import type { PatientContext, SymptomCode } from "@swasthyasetu/core";

export interface SharedTriageContext {
  reportId: string;
  tier: "EMERGENCY" | "GO_NOW";
  decisionSource: "RED_FLAG" | "CLASSIFIER";
  patient: PatientContext;
  symptoms: SymptomCode[];
  redFlagLabels: string[];
  rulesetVersion: string;
  evaluatedAt: string;
  disclaimer: string;
}

export interface VerificationSession {
  verificationSessionId: string;
  provider: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  uploadMode: "PROVIDER_REDIRECT" | "DEVELOPMENT_MOCK";
  uploadUrl: string | null;
}

export interface Emergency {
  emergencyId: string;
  status: "DISPATCH_PENDING" | "FACILITY_NOTIFIED" | "ACCEPTED" | "AMBULANCE_DISPATCHED" | "ARRIVED" | "COMPLETED" | "DECLINED" | "CANCELLED" | "FAILED";
  requestedAt: string;
  updatedAt: string;
  clinicalSummaryShared: boolean;
  triageContextShared: boolean;
  facility: { facilityId: string; name: string; phone: string | null; distanceMeters: number };
}

export interface AbhaStatus {
  linked: boolean;
  identifierMasked: string | null;
  summaryAvailable: boolean;
  summaryValidUntil: string | null;
  source: string | null;
}

export interface AbhaLinkSession {
  abhaLinkSessionId: string;
  provider: string;
  identifierMasked: string;
  status: "PENDING" | "LINKED" | "REJECTED" | "EXPIRED" | "REVOKED";
  linkMode: "ABDM_REDIRECT" | "DEVELOPMENT_MOCK";
  authorizationUrl: string | null;
}

export async function getAbhaStatus() {
  return request<AbhaStatus>("/patients/abha/status", { tokenKey: PATIENT_TOKEN_KEY });
}

export async function startAbhaLink(identifier: string) {
  return request<AbhaLinkSession>("/patients/abha/link-sessions", {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY, body: { identifier, consent: true },
  });
}

export async function completeMockAbhaLink(input: {
  abhaLinkSessionId: string;
  summary: {
    bloodGroup: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN" | null;
    allergies: string[];
    medications: string[];
    conditions: string[];
  };
}) {
  return request<AbhaStatus>("/patients/abha/mock-complete", {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY, body: input,
  });
}

export async function startVerification() {
  return request<VerificationSession>("/patients/verification/sessions", {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY,
    body: { method: "AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS", consent: true },
  });
}

export async function completeMockVerification(verificationSessionId: string) {
  return request<PatientSession>("/patients/verification/mock-complete", {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY, body: { verificationSessionId },
  });
}

export async function createEmergency(input: {
  latitude: number; longitude: number; address: string; notes?: string;
  consentToShareHealthSummary: boolean;
  consentToShareTriageContext: boolean;
  triageContext?: SharedTriageContext;
}) {
  return request<Emergency>("/emergencies", {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY,
    body: { ...input, emergencyType: "MEDICAL", consentToShareLocation: true },
  });
}

export async function getActiveEmergency() {
  return request<Emergency | null>("/emergencies/active", { tokenKey: PATIENT_TOKEN_KEY });
}

export async function cancelEmergency(emergencyId: string) {
  return request<{ cancelled: boolean }>(`/emergencies/${emergencyId}/cancel`, {
    method: "POST", tokenKey: PATIENT_TOKEN_KEY,
  });
}
