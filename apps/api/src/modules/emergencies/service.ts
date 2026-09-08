import { patients as patientContracts } from "@swasthyasetu/contracts";
import { withTransaction } from "../../db/tx.ts";
import { badRequest, conflict, forbidden, notFound } from "../../plugins/errors.ts";
import { findById as findPatientById, latestVerifiedSession } from "../patients/repo.ts";
import { findShareableSummary } from "../abha/repo.ts";
import {
  cancelByPatient, findActiveForPatient, findById, findClosestDispatchFacility,
  insertEmergency, listDispatchQueue, updateStatus,
  type EmergencyRow, type EmergencyStatus,
} from "./repo.ts";

type CreateRequest = ReturnType<typeof patientContracts.createEmergencyRequest.parse>;
type Emergency = ReturnType<typeof patientContracts.emergency.parse>;
type DispatcherEmergency = ReturnType<typeof patientContracts.dispatcherEmergency.parse>;
type DispatcherStatus = ReturnType<typeof patientContracts.dispatcherStatusRequest.parse>;

function patientView(row: EmergencyRow): Emergency {
  return {
    emergencyId: row.emergency_id,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    clinicalSummaryShared: row.clinical_summary_id !== null,
    triageContextShared: row.triage_context !== null,
    facility: {
      facilityId: row.facility_id,
      name: row.name,
      phone: row.phone,
      distanceMeters: row.distance_meters,
    },
  };
}

function dispatcherView(row: EmergencyRow): DispatcherEmergency {
  return {
    ...patientView(row),
    emergencyType: row.emergency_type,
    patient: { fullName: row.patient_full_name, phone: row.patient_phone_snapshot },
    location: { latitude: row.latitude, longitude: row.longitude, address: row.address_snapshot },
    notes: row.notes,
    triageContext: row.triage_context === null
      ? null
      : patientContracts.sharedEmergencyTriageContext.parse(row.triage_context),
    notification: row.notification_id && row.notification_channel && row.notification_status && row.notification_created_at
      ? {
          notificationId: row.notification_id,
          channel: row.notification_channel,
          deliveryStatus: row.notification_status,
          createdAt: row.notification_created_at.toISOString(),
        }
      : null,
    clinicalSummary: row.clinical_summary_id && row.summary_source && row.summary_fetched_at && row.summary_consent_valid_until
      ? {
          source: row.summary_source,
          bloodGroup: row.summary_blood_group,
          allergies: row.summary_allergies ?? [],
          medications: row.summary_medications ?? [],
          conditions: row.summary_conditions ?? [],
          recordCount: row.summary_record_count ?? 0,
          sourceUpdatedAt: row.summary_source_updated_at?.toISOString() ?? null,
          fetchedAt: row.summary_fetched_at.toISOString(),
          consentValidUntil: row.summary_consent_valid_until.toISOString(),
          caution: "Clinical context only. Confirm with the patient and follow approved clinical protocols.",
        }
      : null,
  };
}

export async function createEmergency(patientId: string, input: CreateRequest): Promise<Emergency> {
  const patient = await findPatientById(patientId);
  if (!patient?.is_active) throw forbidden("Patient account is not active.");
  if (patient.verification_status !== "VERIFIED") {
    throw forbidden("Identity verification is required before requesting verified-patient dispatch.");
  }
  const verification = await latestVerifiedSession(patientId);
  if (!verification) throw forbidden("A current identity verification record is required.");
  if (await findActiveForPatient(patientId)) throw conflict("An active emergency request already exists.");

  const facility = await findClosestDispatchFacility(input.latitude, input.longitude);
  if (!facility) throw notFound("No facility with emergency and ambulance capability was found.");

  const summary = input.consentToShareHealthSummary ? await findShareableSummary(patientId) : null;
  if (input.consentToShareHealthSummary && !summary) {
    throw badRequest("No current consented ABHA emergency summary is available. Renew ABHA access or send without it.");
  }

  const emergencyId = await withTransaction((client) => insertEmergency({
    patientId,
    verificationSessionId: verification.verification_session_id,
    facilityId: facility.facility_id,
    districtCode: facility.district_code,
    emergencyType: input.emergencyType,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    patientPhone: patient.phone,
    notes: input.notes,
    clinicalSummaryId: summary?.clinical_summary_id ?? null,
    triageContext: input.triageContext ?? null,
  }, client));
  const created = await findById(emergencyId);
  if (!created) throw new Error("Created emergency could not be read.");
  return patientView(created);
}

export async function activeEmergency(patientId: string): Promise<Emergency | null> {
  const row = await findActiveForPatient(patientId);
  return row ? patientView(row) : null;
}

export async function dispatchQueue(districtCode: string): Promise<{ items: DispatcherEmergency[] }> {
  return { items: (await listDispatchQueue(districtCode)).map(dispatcherView) };
}

const transitions: Record<EmergencyStatus, readonly EmergencyStatus[]> = {
  DISPATCH_PENDING: ["FACILITY_NOTIFIED", "FAILED"],
  FACILITY_NOTIFIED: ["ACCEPTED", "DECLINED", "FAILED"],
  ACCEPTED: ["AMBULANCE_DISPATCHED", "FAILED"],
  AMBULANCE_DISPATCHED: ["ARRIVED", "FAILED"],
  ARRIVED: ["COMPLETED"],
  COMPLETED: [], DECLINED: [], CANCELLED: [], FAILED: [],
};

export async function setDispatchStatus(
  emergencyId: string,
  districtCode: string,
  actorUserId: string,
  input: DispatcherStatus,
): Promise<DispatcherEmergency> {
  const current = await findById(emergencyId);
  if (!current) throw notFound("Emergency request not found.");
  if (current.district_code !== districtCode) throw forbidden("Emergency request belongs to another district.");
  if (!transitions[current.status].includes(input.status)) {
    throw conflict(`Cannot change emergency from ${current.status} to ${input.status}.`);
  }
  await withTransaction((client) => updateStatus(emergencyId, input.status, actorUserId, input.note, client));
  const updated = await findById(emergencyId);
  if (!updated) throw new Error("Updated emergency could not be read.");
  return dispatcherView(updated);
}

export async function cancelEmergency(emergencyId: string, patientId: string): Promise<void> {
  const cancelled = await withTransaction((client) => cancelByPatient(emergencyId, patientId, client));
  if (!cancelled) throw conflict("This emergency can no longer be cancelled from the patient app.");
}
