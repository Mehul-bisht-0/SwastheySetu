import type pg from "pg";
import { query } from "../../db/pool.ts";

export interface AbhaLinkRow {
  abha_link_session_id: string;
  patient_id: string;
  provider: string;
  identifier_masked: string;
  status: "PENDING" | "LINKED" | "REJECTED" | "EXPIRED" | "REVOKED";
  created_at: Date;
}

export interface ClinicalSummaryRow {
  clinical_summary_id: string;
  patient_id: string;
  source: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN" | null;
  allergies: string[];
  medications: string[];
  conditions: string[];
  record_count: number;
  source_updated_at: Date | null;
  fetched_at: Date;
  expires_at: Date;
  consent_valid_until: Date;
}

export async function insertLinkSession(
  patientId: string,
  identifierHash: string,
  identifierMasked: string,
  provider: string,
  client: pg.PoolClient,
): Promise<AbhaLinkRow> {
  const result = await client.query<AbhaLinkRow>(
    `INSERT INTO abha_link_sessions
       (patient_id, provider, identifier_hash, identifier_masked, consented_at)
     VALUES ($1,$2,$3,$4,now())
     RETURNING abha_link_session_id, patient_id, provider, identifier_masked, status, created_at`,
    [patientId, provider, identifierHash, identifierMasked],
  );
  const row = result.rows[0];
  if (!row) throw new Error("ABHA link insert did not return a row.");
  return row;
}

export async function findLinkSession(sessionId: string, patientId: string): Promise<AbhaLinkRow | null> {
  const rows = await query<AbhaLinkRow>(
    `SELECT abha_link_session_id, patient_id, provider, identifier_masked, status, created_at
       FROM abha_link_sessions
      WHERE abha_link_session_id = $1 AND patient_id = $2`,
    [sessionId, patientId],
  );
  return rows[0] ?? null;
}

export async function latestLink(patientId: string): Promise<AbhaLinkRow | null> {
  const rows = await query<AbhaLinkRow>(
    `SELECT abha_link_session_id, patient_id, provider, identifier_masked, status, created_at
       FROM abha_link_sessions WHERE patient_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [patientId],
  );
  return rows[0] ?? null;
}

export async function completeMockLink(
  input: {
    sessionId: string;
    patientId: string;
    consentReference: string;
    bloodGroup: ClinicalSummaryRow["blood_group"];
    allergies: string[];
    medications: string[];
    conditions: string[];
  },
  client: pg.PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE abha_link_sessions SET status = 'LINKED', completed_at = now()
      WHERE abha_link_session_id = $1 AND patient_id = $2 AND status = 'PENDING'`,
    [input.sessionId, input.patientId],
  );
  const consent = await client.query<{ consent_artifact_id: string }>(
    `INSERT INTO abha_consent_artifacts
       (abha_link_session_id, patient_id, provider_consent_reference, purpose,
        health_information_types, status, valid_from, valid_until, granted_at)
     VALUES ($1,$2,$3,'EMERGENCY_CARE',
             ARRAY['AllergyIntolerance','MedicationStatement','Condition','Observation'],
             'GRANTED',now(),now() + interval '24 hours',now())
     RETURNING consent_artifact_id`,
    [input.sessionId, input.patientId, input.consentReference],
  );
  const consentId = consent.rows[0]?.consent_artifact_id;
  if (!consentId) throw new Error("ABHA consent insert did not return a row.");
  await client.query(
    `INSERT INTO patient_emergency_clinical_summaries
       (patient_id, consent_artifact_id, source, blood_group, allergies, medications,
        conditions, record_count, source_updated_at, expires_at)
     VALUES ($1,$2,'ABDM_DEVELOPMENT_MOCK',$3,$4,$5,$6,$7,now(),now() + interval '24 hours')`,
    [input.patientId, consentId, input.bloodGroup, input.allergies, input.medications,
     input.conditions, input.allergies.length + input.medications.length + input.conditions.length],
  );
}

export async function findShareableSummary(patientId: string): Promise<ClinicalSummaryRow | null> {
  const rows = await query<ClinicalSummaryRow>(
    `SELECT s.clinical_summary_id, s.patient_id, s.source, s.blood_group,
            s.allergies, s.medications, s.conditions, s.record_count,
            s.source_updated_at, s.fetched_at, s.expires_at,
            c.valid_until AS consent_valid_until
       FROM patient_emergency_clinical_summaries s
       JOIN abha_consent_artifacts c ON c.consent_artifact_id = s.consent_artifact_id
      WHERE s.patient_id = $1 AND s.expires_at > now()
        AND c.status = 'GRANTED' AND c.valid_from <= now() AND c.valid_until > now()
      ORDER BY s.fetched_at DESC LIMIT 1`,
    [patientId],
  );
  return rows[0] ?? null;
}
