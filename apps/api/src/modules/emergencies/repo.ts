import type pg from "pg";
import { query } from "../../db/pool.ts";

export type EmergencyStatus =
  | "DISPATCH_PENDING" | "FACILITY_NOTIFIED" | "ACCEPTED" | "AMBULANCE_DISPATCHED"
  | "ARRIVED" | "COMPLETED" | "DECLINED" | "CANCELLED" | "FAILED";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";

export interface ClosestFacilityRow {
  facility_id: string;
  name: string;
  phone: string | null;
  district_code: string;
  distance_meters: number;
}

export interface EmergencyRow extends ClosestFacilityRow {
  emergency_id: string;
  patient_id: string;
  emergency_type: "MEDICAL" | "ACCIDENT" | "PREGNANCY" | "OTHER";
  status: EmergencyStatus;
  requested_at: Date;
  updated_at: Date;
  latitude: number;
  longitude: number;
  address_snapshot: string;
  patient_phone_snapshot: string;
  patient_full_name: string;
  notes: string | null;
  clinical_summary_id: string | null;
  triage_context: unknown | null;
  notification_id: string | null;
  notification_channel: "FACILITY_WEBHOOK" | "SMS" | "VOICE" | null;
  notification_status: "PENDING" | "SENT" | "FAILED" | null;
  notification_created_at: Date | null;
  summary_source: string | null;
  summary_blood_group: BloodGroup | null;
  summary_allergies: string[] | null;
  summary_medications: string[] | null;
  summary_conditions: string[] | null;
  summary_record_count: number | null;
  summary_source_updated_at: Date | null;
  summary_fetched_at: Date | null;
  summary_consent_valid_until: Date | null;
}

const emergencySelect = `
  SELECT e.emergency_id, e.patient_id, e.emergency_type, e.status,
         e.requested_at, e.updated_at, e.latitude, e.longitude,
         e.address_snapshot, e.patient_phone_snapshot, e.notes, e.clinical_summary_id,
         e.triage_context,
         n.notification_id, n.channel AS notification_channel,
         n.status AS notification_status, n.created_at AS notification_created_at,
         s.source AS summary_source, s.blood_group AS summary_blood_group,
         s.allergies AS summary_allergies, s.medications AS summary_medications,
         s.conditions AS summary_conditions, s.record_count AS summary_record_count,
         s.source_updated_at AS summary_source_updated_at, s.fetched_at AS summary_fetched_at,
         c.valid_until AS summary_consent_valid_until,
         p.full_name AS patient_full_name,
         f.facility_id, f.name, f.phone, f.district_code,
         ST_Distance(f.geom, e.location)::int AS distance_meters
    FROM emergency_requests e
    JOIN patients p ON p.patient_id = e.patient_id
    JOIN facilities f ON f.facility_id = e.facility_id
    LEFT JOIN dispatch_notifications n
      ON n.emergency_id = e.emergency_id AND n.channel = 'FACILITY_WEBHOOK'
    LEFT JOIN patient_emergency_clinical_summaries s ON s.clinical_summary_id = e.clinical_summary_id
    LEFT JOIN abha_consent_artifacts c ON c.consent_artifact_id = s.consent_artifact_id`;

export async function findClosestDispatchFacility(lat: number, lon: number): Promise<ClosestFacilityRow | null> {
  const rows = await query<ClosestFacilityRow>(
    `SELECT facility_id, name, phone, district_code,
            ST_Distance(geom, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography)::int AS distance_meters
       FROM facilities
      WHERE capability_tags @> ARRAY['EMERGENCY_24X7','AMBULANCE']::text[]
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2,$1),4326)::geography
      LIMIT 1`,
    [lat, lon],
  );
  return rows[0] ?? null;
}

export async function findActiveForPatient(patientId: string): Promise<EmergencyRow | null> {
  const rows = await query<EmergencyRow>(
    `${emergencySelect}
      WHERE e.patient_id = $1
        AND e.status IN ('DISPATCH_PENDING','FACILITY_NOTIFIED','ACCEPTED','AMBULANCE_DISPATCHED','ARRIVED')
      ORDER BY e.requested_at DESC LIMIT 1`,
    [patientId],
  );
  return rows[0] ?? null;
}

export async function findById(emergencyId: string): Promise<EmergencyRow | null> {
  const rows = await query<EmergencyRow>(`${emergencySelect} WHERE e.emergency_id = $1`, [emergencyId]);
  return rows[0] ?? null;
}

export async function insertEmergency(
  input: {
    patientId: string;
    verificationSessionId: string;
    facilityId: string;
    districtCode: string;
    emergencyType: string;
    latitude: number;
    longitude: number;
    address: string;
    patientPhone: string;
    notes?: string;
    clinicalSummaryId: string | null;
    triageContext: unknown | null;
  },
  client: pg.PoolClient,
): Promise<string> {
  const inserted = await client.query<{ emergency_id: string }>(
    `INSERT INTO emergency_requests
       (patient_id, verification_session_id, facility_id, district_code, emergency_type,
        latitude, longitude, location, address_snapshot, patient_phone_snapshot, notes,
        clinical_summary_id, clinical_summary_shared_at,
        triage_context, triage_context_shared_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
             ST_SetSRID(ST_MakePoint($7,$6),4326)::geography,$8,$9,$10,$11,
             CASE WHEN $11::uuid IS NULL THEN NULL ELSE now() END,
             $12::jsonb, CASE WHEN $12::jsonb IS NULL THEN NULL ELSE now() END)
     RETURNING emergency_id`,
    [input.patientId, input.verificationSessionId, input.facilityId, input.districtCode,
     input.emergencyType, input.latitude, input.longitude, input.address, input.patientPhone,
     input.notes ?? null, input.clinicalSummaryId,
     input.triageContext === null ? null : JSON.stringify(input.triageContext)],
  );
  const emergencyId = inserted.rows[0]?.emergency_id;
  if (!emergencyId) throw new Error("Emergency insert did not return a row.");
  await client.query(
    `INSERT INTO emergency_events (emergency_id, event_type, actor_patient_id, detail)
     VALUES ($1,'REQUESTED',$2,jsonb_build_object(
       'clinicalSummaryShared',$3::boolean,
       'triageContextShared',$4::boolean
     ))`,
    [emergencyId, input.patientId, input.clinicalSummaryId !== null, input.triageContext !== null],
  );
  await client.query(
    `INSERT INTO dispatch_notifications (emergency_id, facility_id, channel)
     VALUES ($1,$2,'FACILITY_WEBHOOK')`,
    [emergencyId, input.facilityId],
  );
  return emergencyId;
}

export async function listDispatchQueue(districtCode: string): Promise<EmergencyRow[]> {
  return query<EmergencyRow>(
    `${emergencySelect}
      WHERE e.district_code = $1
        AND e.status IN ('DISPATCH_PENDING','FACILITY_NOTIFIED','ACCEPTED','AMBULANCE_DISPATCHED','ARRIVED')
      ORDER BY e.requested_at`,
    [districtCode],
  );
}

export async function updateStatus(
  emergencyId: string,
  status: EmergencyStatus,
  actorUserId: string,
  note: string | undefined,
  client: pg.PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE emergency_requests
        SET status = $2,
            accepted_at = CASE WHEN $2 = 'ACCEPTED' THEN now() ELSE accepted_at END,
            ambulance_dispatched_at = CASE WHEN $2 = 'AMBULANCE_DISPATCHED' THEN now() ELSE ambulance_dispatched_at END,
            arrived_at = CASE WHEN $2 = 'ARRIVED' THEN now() ELSE arrived_at END,
            completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END
      WHERE emergency_id = $1`,
    [emergencyId, status],
  );
  await client.query(
    `INSERT INTO emergency_events (emergency_id, event_type, actor_user_id, detail)
     VALUES ($1,$2,$3,jsonb_build_object('note',$4::text))`,
    [emergencyId, status, actorUserId, note ?? null],
  );
  if (status === "FACILITY_NOTIFIED") {
    await client.query(
      `UPDATE dispatch_notifications SET status = 'SENT', attempt_count = attempt_count + 1,
              last_attempt_at = now()
        WHERE emergency_id = $1 AND status = 'PENDING'`,
      [emergencyId],
    );
  }
}

export async function cancelByPatient(
  emergencyId: string,
  patientId: string,
  client: pg.PoolClient,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE emergency_requests SET status = 'CANCELLED', cancelled_at = now()
      WHERE emergency_id = $1 AND patient_id = $2
        AND status IN ('DISPATCH_PENDING','FACILITY_NOTIFIED','ACCEPTED','AMBULANCE_DISPATCHED')
      RETURNING emergency_id`,
    [emergencyId, patientId],
  );
  if (result.rowCount === 0) return false;
  await client.query(
    `INSERT INTO emergency_events (emergency_id, event_type, actor_patient_id)
     VALUES ($1,'CANCELLED',$2)`,
    [emergencyId, patientId],
  );
  return true;
}
