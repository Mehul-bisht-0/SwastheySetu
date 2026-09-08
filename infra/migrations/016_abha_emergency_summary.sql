-- Consent-based ABHA linkage and minimal emergency clinical summaries.
--
-- An ABHA card is an identifier, not a medical-history document. Full ABHA
-- identifiers and raw FHIR documents are deliberately not retained here.

CREATE TABLE abha_link_sessions (
  abha_link_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  provider             text NOT NULL,
  identifier_hash      text NOT NULL CHECK (length(identifier_hash) = 64),
  identifier_masked    text NOT NULL,
  status               text NOT NULL DEFAULT 'PENDING' CHECK
                        (status IN ('PENDING','LINKED','REJECTED','EXPIRED','REVOKED')),
  consented_at         timestamptz NOT NULL,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX abha_link_patient_idx ON abha_link_sessions(patient_id, created_at DESC);

CREATE TABLE abha_consent_artifacts (
  consent_artifact_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  abha_link_session_id      uuid NOT NULL REFERENCES abha_link_sessions(abha_link_session_id) ON DELETE CASCADE,
  patient_id                uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  provider_consent_reference text NOT NULL UNIQUE,
  purpose                   text NOT NULL CHECK (purpose = 'EMERGENCY_CARE'),
  health_information_types  text[] NOT NULL,
  status                    text NOT NULL CHECK (status IN ('GRANTED','DENIED','REVOKED','EXPIRED')),
  valid_from                timestamptz NOT NULL,
  valid_until               timestamptz NOT NULL,
  granted_at                timestamptz,
  revoked_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

CREATE INDEX abha_consent_patient_idx ON abha_consent_artifacts(patient_id, valid_until DESC);

CREATE TABLE patient_emergency_clinical_summaries (
  clinical_summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  consent_artifact_id uuid NOT NULL REFERENCES abha_consent_artifacts(consent_artifact_id) ON DELETE CASCADE,
  source              text NOT NULL,
  blood_group         text CHECK (blood_group IS NULL OR blood_group IN
                       ('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN')),
  allergies           text[] NOT NULL DEFAULT '{}',
  medications         text[] NOT NULL DEFAULT '{}',
  conditions          text[] NOT NULL DEFAULT '{}',
  record_count        integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  source_updated_at   timestamptz,
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX emergency_summary_patient_idx
  ON patient_emergency_clinical_summaries(patient_id, expires_at DESC);

ALTER TABLE emergency_requests
  ADD COLUMN clinical_summary_id uuid REFERENCES patient_emergency_clinical_summaries(clinical_summary_id),
  ADD COLUMN clinical_summary_shared_at timestamptz;
