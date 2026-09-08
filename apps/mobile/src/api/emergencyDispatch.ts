import { request } from "./client.ts";
import type { SharedTriageContext } from "./patients.ts";

export type DispatchStatus = "DISPATCH_PENDING" | "FACILITY_NOTIFIED" | "ACCEPTED" | "AMBULANCE_DISPATCHED" | "ARRIVED" | "COMPLETED" | "DECLINED" | "FAILED";
export interface DispatchEmergency {
  emergencyId: string;
  status: DispatchStatus;
  requestedAt: string;
  updatedAt: string;
  emergencyType: string;
  patient: { fullName: string; phone: string };
  location: { latitude: number; longitude: number; address: string };
  notes: string | null;
  facility: { facilityId: string; name: string; phone: string | null; distanceMeters: number };
  clinicalSummaryShared: boolean;
  triageContextShared: boolean;
  triageContext: SharedTriageContext | null;
  notification: {
    notificationId: string;
    channel: "FACILITY_WEBHOOK" | "SMS" | "VOICE";
    deliveryStatus: "PENDING" | "SENT" | "FAILED";
    createdAt: string;
  } | null;
  clinicalSummary: {
    source: string;
    bloodGroup: string | null;
    allergies: string[];
    medications: string[];
    conditions: string[];
    recordCount: number;
    sourceUpdatedAt: string | null;
    fetchedAt: string;
    consentValidUntil: string;
    caution: string;
  } | null;
}

export async function getDispatchQueue() {
  return request<{ items: DispatchEmergency[] }>("/emergencies/dispatch-queue");
}

export async function updateDispatchStatus(emergencyId: string, status: DispatchStatus) {
  return request<DispatchEmergency>(`/emergencies/${emergencyId}/status`, {
    method: "POST", body: { status },
  });
}
