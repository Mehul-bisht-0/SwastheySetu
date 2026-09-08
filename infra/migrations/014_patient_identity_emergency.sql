-- Patient identity verification and emergency dispatch.
--
-- Raw Aadhaar numbers, Aadhaar images, selfies and biometric templates are
-- deliberately absent. Verification evidence stays with the identity provider;
-- this database stores only its opaque reference and decision.

CREATE TABLE patients (
  patient_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                  text NOT NULL UNIQUE,
  full_name              text NOT NULL,
  password_hash          text NOT NULL,
  district_code          text NOT NULL REFERENCES districts(district_code),
  home_address           text NOT NULL,
  verification_status    text NOT NULL DEFAULT 'UNVERIFIED' CHECK
                           (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED','EXPIRED')),
  verified_at            timestamptz,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER patients_updated BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE patient_devices (
  device_id       text PRIMARY KEY,
  patient_id      uuid REFERENCES patients(patient_id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('android','ios','unknown')),
  app_version     text NOT NULL,
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_devices_patient_idx ON patient_devices(patient_id);

CREATE TABLE identity_verification_sessions (
  verification_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id               uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  method                   text NOT NULL CHECK (method IN ('AADHAAR_OFFLINE_EKYC')),
  provider                 text NOT NULL,
  provider_reference       text UNIQUE,
  status                   text NOT NULL DEFAULT 'PENDING' CHECK
                            (status IN ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  consented_at             timestamptz NOT NULL,
  completed_at             timestamptz,
  failure_code             text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_verification_patient_idx
  ON identity_verification_sessions(patient_id, created_at DESC);

CREATE TABLE emergency_requests (
  emergency_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id               uuid NOT NULL REFERENCES patients(patient_id),
  verification_session_id  uuid NOT NULL REFERENCES identity_verification_sessions(verification_session_id),
  facility_id              uuid NOT NULL REFERENCES facilities(facility_id),
  district_code            text NOT NULL REFERENCES districts(district_code),
  emergency_type           text NOT NULL CHECK
                            (emergency_type IN ('MEDICAL','ACCIDENT','PREGNANCY','OTHER')),
  latitude                 double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude                double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location                 geography(Point,4326) NOT NULL,
  address_snapshot         text NOT NULL,
  patient_phone_snapshot   text NOT NULL,
  notes                    text,
  status                   text NOT NULL DEFAULT 'DISPATCH_PENDING' CHECK
                            (status IN ('DISPATCH_PENDING','FACILITY_NOTIFIED','ACCEPTED','AMBULANCE_DISPATCHED',
                                        'ARRIVED','COMPLETED','DECLINED','CANCELLED','FAILED')),
  requested_at             timestamptz NOT NULL DEFAULT now(),
  accepted_at              timestamptz,
  ambulance_dispatched_at  timestamptz,
  arrived_at               timestamptz,
  completed_at             timestamptz,
  cancelled_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER emergency_requests_updated BEFORE UPDATE ON emergency_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX emergency_one_active_per_patient
  ON emergency_requests(patient_id)
  WHERE status IN ('DISPATCH_PENDING','FACILITY_NOTIFIED','ACCEPTED','AMBULANCE_DISPATCHED','ARRIVED');

CREATE INDEX emergency_facility_queue_idx
  ON emergency_requests(facility_id, status, requested_at);

CREATE INDEX emergency_location_gix ON emergency_requests USING GIST(location);

CREATE TABLE emergency_events (
  emergency_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id       uuid NOT NULL REFERENCES emergency_requests(emergency_id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  actor_user_id      uuid REFERENCES users(user_id),
  actor_patient_id   uuid REFERENCES patients(patient_id),
  detail             jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_user_id IS NULL) OR (actor_patient_id IS NULL))
);

CREATE INDEX emergency_events_request_idx ON emergency_events(emergency_id, created_at);

-- Transactional outbox. A future worker delivers these rows to an authorised
-- facility webhook/SMS provider and records success or terminal failure.
CREATE TABLE dispatch_notifications (
  notification_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id      uuid NOT NULL REFERENCES emergency_requests(emergency_id) ON DELETE CASCADE,
  facility_id       uuid NOT NULL REFERENCES facilities(facility_id),
  channel           text NOT NULL CHECK (channel IN ('FACILITY_WEBHOOK','SMS','VOICE')),
  status            text NOT NULL DEFAULT 'PENDING' CHECK
                    (status IN ('PENDING','SENT','FAILED')),
  attempt_count     integer NOT NULL DEFAULT 0,
  last_attempt_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emergency_id, channel)
);

CREATE INDEX dispatch_notifications_pending_idx
  ON dispatch_notifications(status, created_at) WHERE status = 'PENDING';
