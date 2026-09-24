-- Operational diagnostic coordination. This module records human-entered orders
-- and evidence; it never diagnoses or changes triage urgency.

CREATE TABLE diagnostic_tests (
  test_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_system text NOT NULL,
  code text NOT NULL,
  display text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('LAB','IMAGING','POINT_OF_CARE')),
  specimen_type text,
  preparation jsonb NOT NULL DEFAULT '{"en":"Confirm preparation with the facility.","hi":"तैयारी के लिए सुविधा से पुष्टि करें।","mr":"तयारीसाठी सुविधेशी पुष्टी करा."}',
  is_active boolean NOT NULL DEFAULT true,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code_system,code)
);
CREATE TRIGGER diagnostic_tests_updated BEFORE UPDATE ON diagnostic_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE facility_diagnostic_services (
  service_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  test_id uuid NOT NULL REFERENCES diagnostic_tests(test_id),
  collection_supported boolean NOT NULL,
  processing_model text NOT NULL CHECK (processing_model IN ('ON_SITE','HUB')),
  processing_facility_id uuid REFERENCES facilities(facility_id),
  appointment_required boolean NOT NULL DEFAULT false,
  turnaround_minutes_min integer NOT NULL CHECK (turnaround_minutes_min > 0),
  turnaround_minutes_max integer NOT NULL CHECK (turnaround_minutes_max >= turnaround_minutes_min),
  indicative_cost_paisa_min integer CHECK (indicative_cost_paisa_min IS NULL OR indicative_cost_paisa_min >= 0),
  indicative_cost_paisa_max integer CHECK (indicative_cost_paisa_max IS NULL OR indicative_cost_paisa_max >= COALESCE(indicative_cost_paisa_min,0)),
  supported_schemes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((processing_model='ON_SITE' AND processing_facility_id IS NULL) OR (processing_model='HUB' AND processing_facility_id IS NOT NULL)),
  UNIQUE(facility_id,test_id)
);
CREATE TRIGGER facility_diagnostic_services_updated BEFORE UPDATE ON facility_diagnostic_services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX facility_diagnostic_services_lookup_idx ON facility_diagnostic_services(test_id,facility_id) WHERE is_active;

CREATE TABLE diagnostic_service_events (
  service_event_id uuid PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES facility_diagnostic_services(service_id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'COLLECTION_CONFIRMED','PROCESSING_CONFIRMED','REAGENT_CONFIRMED',
    'STOCK_OUT_REPORTED','MACHINE_DOWN_REPORTED','COLLECTION_PAUSED_REPORTED'
  )),
  observed_at timestamptz NOT NULL CHECK (observed_at <= now()+interval '1 day'),
  provider_practitioner_id uuid REFERENCES practitioners(practitioner_id),
  worker_user_id uuid REFERENCES users(user_id),
  note text CHECK (note IS NULL OR length(note)<=500),
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((provider_practitioner_id IS NULL) <> (worker_user_id IS NULL))
);
CREATE INDEX diagnostic_service_events_service_idx ON diagnostic_service_events(service_id,observed_at DESC);

CREATE TABLE diagnostic_orders (
  order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE CHECK (tracking_code ~ '^D[0-9]{7}$'),
  patient_id uuid NOT NULL REFERENCES patients(patient_id),
  service_id uuid NOT NULL REFERENCES facility_diagnostic_services(service_id),
  origin_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  destination_facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  ordering_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  consent_request_id uuid UNIQUE REFERENCES abdm_consent_requests(consent_request_id),
  consent_grant_id uuid REFERENCES abdm_consent_grants(consent_grant_id),
  priority text NOT NULL CHECK (priority IN ('ROUTINE','URGENT')),
  practitioner_reason text NOT NULL,
  service_request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED','ACCEPTED','SCHEDULED','IN_PROGRESS','RESULT_READY','COMPLETED','DECLINED','CANCELLED'
  )),
  requested_window_start timestamptz,
  requested_window_end timestamptz,
  scheduled_at timestamptz,
  expected_by timestamptz,
  result_record_id uuid REFERENCES abdm_health_records(record_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_window_start IS NULL OR requested_window_end IS NULL OR requested_window_start<=requested_window_end)
);
CREATE TRIGGER diagnostic_orders_updated BEFORE UPDATE ON diagnostic_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX diagnostic_orders_origin_idx ON diagnostic_orders(origin_facility_id,updated_at DESC);
CREATE INDEX diagnostic_orders_destination_idx ON diagnostic_orders(destination_facility_id,updated_at DESC);
CREATE INDEX diagnostic_orders_patient_idx ON diagnostic_orders(patient_id,updated_at DESC);

CREATE TABLE diagnostic_order_events (
  order_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_practitioner_id uuid REFERENCES practitioners(practitioner_id),
  actor_patient_id uuid REFERENCES patients(patient_id),
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_practitioner_id IS NULL) OR (actor_patient_id IS NULL))
);
CREATE INDEX diagnostic_order_events_order_idx ON diagnostic_order_events(order_id,occurred_at);

CREATE TABLE diagnostic_specimens (
  specimen_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  accession_code text NOT NULL UNIQUE,
  specimen_type text NOT NULL,
  status text NOT NULL DEFAULT 'COLLECTION_PENDING' CHECK (status IN ('COLLECTION_PENDING','COLLECTED','IN_TRANSIT','RECEIVED','REJECTED')),
  collected_at timestamptz,
  received_at timestamptz,
  rejection_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER diagnostic_specimens_updated BEFORE UPDATE ON diagnostic_specimens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE diagnostic_specimen_events (
  specimen_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specimen_id uuid NOT NULL REFERENCES diagnostic_specimens(specimen_id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diagnostic_specimen_events_specimen_idx ON diagnostic_specimen_events(specimen_id,recorded_at);

CREATE TABLE diagnostic_access_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  practitioner_id uuid REFERENCES practitioners(practitioner_id),
  patient_id uuid REFERENCES patients(patient_id),
  facility_id uuid REFERENCES facilities(facility_id),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diagnostic_access_order_idx ON diagnostic_access_audit(order_id,occurred_at DESC);

CREATE TABLE diagnostic_notification_preferences (
  patient_id uuid PRIMARY KEY REFERENCES patients(patient_id) ON DELETE CASCADE,
  sms_opt_in boolean NOT NULL DEFAULT false,
  voice_opt_in boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '20:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

