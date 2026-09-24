-- Synthetic ABDM-shaped continuity network. This is a development simulator,
-- not an NHA connection. It stores no Aadhaar value or biometric material.

CREATE TABLE practitioners (
  practitioner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hpr_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  qualification text NOT NULL,
  specialty text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER practitioners_updated BEFORE UPDATE ON practitioners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE provider_accounts (
  provider_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  phone text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER provider_accounts_updated BEFORE UPDATE ON provider_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE practitioner_facilities (
  practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('DOCTOR','NURSE','LAB_TECH','RECORDS_OFFICER','FACILITY_ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (practitioner_id, facility_id)
);

CREATE TABLE provider_sessions (
  token_hash text PRIMARY KEY,
  provider_account_id uuid NOT NULL REFERENCES provider_accounts(provider_account_id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_sessions_account_idx ON provider_sessions(provider_account_id, expires_at DESC);

CREATE TABLE mock_abha_profiles (
  patient_id uuid PRIMARY KEY REFERENCES patients(patient_id) ON DELETE CASCADE,
  identifier_hash text NOT NULL UNIQUE,
  identifier_masked text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DEACTIVATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER mock_abha_profiles_updated BEFORE UPDATE ON mock_abha_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE abdm_care_contexts (
  care_context_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  hip_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  context_reference text NOT NULL,
  display text NOT NULL,
  link_status text NOT NULL DEFAULT 'PENDING' CHECK (link_status IN ('PENDING','LINKED','UNLINKED')),
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hip_facility_id, context_reference)
);
CREATE INDEX abdm_care_contexts_patient_idx ON abdm_care_contexts(patient_id, created_at DESC);

CREATE TABLE abdm_health_records (
  record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  care_context_id uuid NOT NULL REFERENCES abdm_care_contexts(care_context_id),
  hip_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  author_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  record_type text NOT NULL CHECK (record_type IN (
    'OP_CONSULTATION','PRESCRIPTION','DIAGNOSTIC_REPORT','DISCHARGE_SUMMARY',
    'IMMUNIZATION_RECORD','WELLNESS_RECORD','HEALTH_DOCUMENT','INVOICE_RECORD'
  )),
  title text NOT NULL,
  authored_at timestamptz NOT NULL,
  profile_url text NOT NULL,
  fhir_version text NOT NULL DEFAULT '6.5.0',
  fhir_bundle jsonb NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}',
  checksum text NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','ENTERED_IN_ERROR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hip_facility_id, checksum)
);
CREATE INDEX abdm_health_records_timeline_idx ON abdm_health_records(patient_id, authored_at DESC, record_id);
CREATE INDEX abdm_health_records_context_idx ON abdm_health_records(care_context_id, authored_at DESC);

CREATE TABLE abdm_consent_requests (
  consent_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  requesting_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  requesting_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  purpose text NOT NULL,
  requested_hi_types text[] NOT NULL CHECK (cardinality(requested_hi_types) BETWEEN 1 AND 8),
  date_from timestamptz NOT NULL,
  date_to timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  referral_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','GRANTED','DENIED','REVOKED','EXPIRED')),
  explanation jsonb NOT NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_from <= date_to)
);
CREATE INDEX abdm_consent_requests_patient_idx ON abdm_consent_requests(patient_id, created_at DESC);
CREATE INDEX abdm_consent_requests_hiu_idx ON abdm_consent_requests(requesting_facility_id, created_at DESC);

CREATE TABLE abdm_consent_grants (
  consent_grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_request_id uuid NOT NULL UNIQUE REFERENCES abdm_consent_requests(consent_request_id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  hiu_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  approved_hi_types text[] NOT NULL CHECK (cardinality(approved_hi_types) BETWEEN 1 AND 8),
  date_from timestamptz NOT NULL,
  date_to timestamptz NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED','REVOKED','EXPIRED')),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from < valid_until),
  CHECK (date_from <= date_to)
);
CREATE INDEX abdm_consent_grants_access_idx ON abdm_consent_grants(patient_id, hiu_facility_id, valid_until DESC);

CREATE TABLE abdm_consent_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_request_id uuid NOT NULL REFERENCES abdm_consent_requests(consent_request_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('REQUESTED','GRANTED','DENIED','REVOKED','EXPIRED')),
  actor_type text NOT NULL CHECK (actor_type IN ('PATIENT','PROVIDER','SYSTEM','ASHA_ASSISTED')),
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abdm_consent_events_request_idx ON abdm_consent_events(consent_request_id, occurred_at);

CREATE TABLE abdm_record_access_audit (
  access_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  consent_grant_id uuid REFERENCES abdm_consent_grants(consent_grant_id),
  purpose text NOT NULL,
  action text NOT NULL CHECK (action IN ('TIMELINE_READ','RECORD_READ','CARE_PACKET_CREATED')),
  record_ids uuid[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abdm_record_access_patient_idx ON abdm_record_access_audit(patient_id, occurred_at DESC);

CREATE TABLE abdm_care_packets (
  packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  consent_grant_id uuid NOT NULL REFERENCES abdm_consent_grants(consent_grant_id),
  facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  record_ids uuid[] NOT NULL,
  manifest jsonb NOT NULL,
  signature text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abdm_care_packets_access_idx ON abdm_care_packets(facility_id, expires_at DESC);

CREATE TABLE abdm_referrals (
  referral_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  origin_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  receiving_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  referring_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  consent_grant_id uuid NOT NULL REFERENCES abdm_consent_grants(consent_grant_id),
  reason text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('ROUTINE','URGENT')),
  requested_service text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','ACCEPTED','SCHEDULED','ARRIVED','COMPLETED','DECLINED','CANCELLED')),
  expected_arrival_at timestamptz,
  scheduled_at timestamptz,
  outcome text,
  follow_up text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origin_facility_id <> receiving_facility_id)
);
CREATE TRIGGER abdm_referrals_updated BEFORE UPDATE ON abdm_referrals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX abdm_referrals_origin_idx ON abdm_referrals(origin_facility_id, updated_at DESC);
CREATE INDEX abdm_referrals_receiving_idx ON abdm_referrals(receiving_facility_id, updated_at DESC);

CREATE TABLE abdm_referral_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES abdm_referrals(referral_id) ON DELETE CASCADE,
  actor_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  from_status text,
  to_status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE abdm_patient_coverage (
  coverage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  scheme_name text NOT NULL,
  member_id_masked text NOT NULL,
  valid_until date,
  is_demo_data boolean NOT NULL DEFAULT true,
  UNIQUE (patient_id, scheme_name)
);

CREATE TABLE abdm_provider_operations (
  operation_id uuid PRIMARY KEY,
  provider_account_id uuid NOT NULL REFERENCES provider_accounts(provider_account_id),
  operation_type text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
