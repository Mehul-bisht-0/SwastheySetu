import type pg from "pg";
import { query } from "../../db/pool.ts";

export interface PatientRow {
  patient_id: string;
  phone: string;
  full_name: string;
  password_hash: string;
  district_code: string;
  home_address: string;
  verification_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  verified_at: Date | null;
  is_active: boolean;
}

export interface VerificationRow {
  verification_session_id: string;
  patient_id: string;
  method: "AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS";
  provider: string;
  provider_reference: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  created_at: Date;
}

export async function findByPhone(phone: string): Promise<PatientRow | null> {
  const rows = await query<PatientRow>(
    `SELECT patient_id, phone, full_name, password_hash, district_code, home_address,
            verification_status, verified_at, is_active
       FROM patients WHERE phone = $1`,
    [phone],
  );
  return rows[0] ?? null;
}

export async function findById(patientId: string): Promise<PatientRow | null> {
  const rows = await query<PatientRow>(
    `SELECT patient_id, phone, full_name, password_hash, district_code, home_address,
            verification_status, verified_at, is_active
       FROM patients WHERE patient_id = $1`,
    [patientId],
  );
  return rows[0] ?? null;
}

export async function insertPatient(
  input: { phone: string; fullName: string; districtCode: string; homeAddress: string },
  passwordHash: string,
  client: pg.PoolClient,
): Promise<PatientRow> {
  const result = await client.query<PatientRow>(
    `INSERT INTO patients (phone, full_name, password_hash, district_code, home_address)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING patient_id, phone, full_name, password_hash, district_code, home_address,
               verification_status, verified_at, is_active`,
    [input.phone, input.fullName, passwordHash, input.districtCode, input.homeAddress],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Patient insert did not return a row.");
  return row;
}

export async function upsertDevice(
  deviceId: string,
  patientId: string,
  platform: string,
  appVersion: string,
  client?: pg.PoolClient,
): Promise<void> {
  const sql = `INSERT INTO patient_devices (device_id, patient_id, platform, app_version, last_seen_at)
               VALUES ($1,$2,$3,$4,now())
               ON CONFLICT (device_id) DO UPDATE
                 SET patient_id = EXCLUDED.patient_id,
                     platform = EXCLUDED.platform,
                     app_version = EXCLUDED.app_version,
                     last_seen_at = now()`;
  const params = [deviceId, patientId, platform, appVersion];
  if (client) await client.query(sql, params); else await query(sql, params);
}

export async function insertVerificationSession(
  patientId: string,
  method: "AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS",
  provider: string,
  client: pg.PoolClient,
): Promise<VerificationRow> {
  const result = await client.query<VerificationRow>(
    `INSERT INTO identity_verification_sessions
       (patient_id, method, provider, status, consented_at)
     VALUES ($1,$2,$3,'PENDING',now())
     RETURNING verification_session_id, patient_id, method, provider,
               provider_reference, status, created_at`,
    [patientId, method, provider],
  );
  await client.query(
    "UPDATE patients SET verification_status = 'PENDING', verified_at = NULL WHERE patient_id = $1",
    [patientId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Verification insert did not return a row.");
  return row;
}

export async function findVerificationSession(
  sessionId: string,
  patientId: string,
): Promise<VerificationRow | null> {
  const rows = await query<VerificationRow>(
    `SELECT verification_session_id, patient_id, method, provider,
            provider_reference, status, created_at
       FROM identity_verification_sessions
      WHERE verification_session_id = $1 AND patient_id = $2`,
    [sessionId, patientId],
  );
  return rows[0] ?? null;
}

export async function completeMockVerification(
  sessionId: string,
  patientId: string,
  providerReference: string,
  client: pg.PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE identity_verification_sessions
        SET status = 'VERIFIED', provider_reference = $3, completed_at = now()
      WHERE verification_session_id = $1 AND patient_id = $2 AND status = 'PENDING'`,
    [sessionId, patientId, providerReference],
  );
  await client.query(
    "UPDATE patients SET verification_status = 'VERIFIED', verified_at = now() WHERE patient_id = $1",
    [patientId],
  );
}

export async function latestVerifiedSession(patientId: string): Promise<VerificationRow | null> {
  const rows = await query<VerificationRow>(
    `SELECT verification_session_id, patient_id, method, provider,
            provider_reference, status, created_at
       FROM identity_verification_sessions
      WHERE patient_id = $1 AND status = 'VERIFIED'
      ORDER BY completed_at DESC LIMIT 1`,
    [patientId],
  );
  return rows[0] ?? null;
}
