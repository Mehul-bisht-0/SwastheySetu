-- STATUS: Implemented — Stage 2 Phase 2; additive, test database first.

-- Telephone-created cases have no authenticated worker as their creator.
ALTER TABLE intake_cases ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE worker_assignment_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE intake_cases
  ADD COLUMN source text NOT NULL DEFAULT 'ASHA_TEST'
    CHECK (source IN ('ASHA_TEST','KEYPAD_IVR')),
  ADD COLUMN intake_complete boolean NOT NULL DEFAULT true;

-- Short numeric codes are configured for the pilot; callers never key UUIDs.
CREATE TABLE ivr_village_routes (
  dial_code text PRIMARY KEY CHECK (dial_code ~ '^[0-9]{1,8}$'),
  village_id uuid NOT NULL UNIQUE REFERENCES villages(village_id),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ivr_calls (
  call_id uuid PRIMARY KEY,
  provider text NOT NULL,
  provider_call_id text NOT NULL,
  caller_phone text CHECK (caller_phone IS NULL OR caller_phone ~ '^\+?[0-9]{7,15}$'),
  state text NOT NULL CHECK (state IN (
    'LANGUAGE','CONSENT','RELATIONSHIP','VILLAGE','CATEGORY','DURATION',
    'CALLBACK_CHOICE','CALLBACK_NUMBER','CONFIRM','COMPLETED','FAILED','HUNG_UP'
  )),
  language text CHECK (language IN ('hi','en')),
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  invalid_attempts integer NOT NULL DEFAULT 0 CHECK (invalid_attempts >= 0),
  timeout_attempts integer NOT NULL DEFAULT 0 CHECK (timeout_attempts >= 0),
  consent_version text,
  consent_at timestamptz,
  case_id uuid UNIQUE REFERENCES intake_cases(case_id) ON DELETE SET NULL,
  terminal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(provider, provider_call_id)
);
CREATE INDEX ivr_calls_expiry_idx ON ivr_calls(expires_at);

-- Payload bodies are deliberately not retained. The stored response makes retries idempotent.
CREATE TABLE ivr_provider_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  call_id uuid NOT NULL REFERENCES ivr_calls(call_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('START','DTMF','TIMEOUT','HANGUP')),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(provider, provider_event_id)
);
CREATE INDEX ivr_provider_events_expiry_idx ON ivr_provider_events(expires_at);
