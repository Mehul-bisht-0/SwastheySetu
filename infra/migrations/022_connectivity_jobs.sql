-- Role-scoped idempotency, notification work and replay-safe diagnostic IVR.

CREATE TABLE connectivity_operations (
  operation_id uuid PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('PROVIDER','PATIENT','ASHA')),
  actor_id uuid NOT NULL,
  facility_id uuid REFERENCES facilities(facility_id),
  operation_type text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('APPLIED','REJECTED')),
  result jsonb NOT NULL,
  error_code text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connectivity_operations_actor_idx ON connectivity_operations(actor_type,actor_id,received_at DESC);

CREATE TABLE notification_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('DIAGNOSTIC_STATUS_SMS','DIAGNOSTIC_STATUS_VOICE','DIAGNOSTIC_OVERDUE_FOLLOWUP')),
  order_id uuid NOT NULL REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','SENT','FAILED','CANCELLED')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_jobs_updated BEFORE UPDATE ON notification_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX notification_jobs_pending_idx ON notification_jobs(next_attempt_at,created_at) WHERE status IN ('PENDING','LEASED');

CREATE TABLE notification_delivery_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES notification_jobs(job_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('MOCK_SMS','MOCK_VOICE')),
  outcome text NOT NULL CHECK (outcome IN ('SENT','RETRY','FAILED')),
  provider_reference text,
  detail jsonb NOT NULL DEFAULT '{}',
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_ivr_calls (
  ivr_call_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_call_id text NOT NULL,
  caller_phone text NOT NULL,
  language text NOT NULL DEFAULT 'hi' CHECK (language IN ('hi','mr','en')),
  state text NOT NULL DEFAULT 'LANGUAGE',
  tracking_code text,
  terminal boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_call_id)
);
CREATE TRIGGER diagnostic_ivr_calls_updated BEFORE UPDATE ON diagnostic_ivr_calls
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE diagnostic_ivr_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  ivr_call_id uuid NOT NULL REFERENCES diagnostic_ivr_calls(ivr_call_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  response jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,provider_event_id)
);

