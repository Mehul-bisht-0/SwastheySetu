-- STATUS: Implemented — Stage 2 Phase 1; additive, test database first.
CREATE TABLE village_worker_assignments (
  village_id uuid PRIMARY KEY REFERENCES villages(village_id),
  asha_id uuid NOT NULL REFERENCES users(user_id),
  updated_by uuid NOT NULL REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intake_cases (
  case_id uuid PRIMARY KEY,
  district_code text NOT NULL REFERENCES districts(district_code),
  village_id uuid NOT NULL REFERENCES villages(village_id),
  assigned_asha_id uuid REFERENCES users(user_id),
  created_by uuid NOT NULL REFERENCES users(user_id),
  language text NOT NULL CHECK (language IN ('hi','en')),
  status text NOT NULL CHECK (status IN ('UNASSIGNED','ASSIGNED','ACKNOWLEDGED','HANDOFF_REQUESTED','CLOSED')),
  handoff_reason text CHECK (handoff_reason IN ('CALLER_REQUEST','UNDERSTANDING_DIFFICULTY','UNSUPPORTED_REQUEST','WORKER_UNABLE')),
  version integer NOT NULL DEFAULT 1,
  intake jsonb NOT NULL,
  transcript text,
  consent_version text NOT NULL,
  consent_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK ((status = 'UNASSIGNED' AND assigned_asha_id IS NULL) OR
         (status <> 'UNASSIGNED' AND assigned_asha_id IS NOT NULL))
);
CREATE INDEX intake_cases_worker_idx ON intake_cases(assigned_asha_id, created_at);
CREATE INDEX intake_cases_district_idx ON intake_cases(district_code, created_at);
CREATE INDEX intake_cases_expiry_idx ON intake_cases(expires_at);

-- Events contain operational metadata only, never free text, contact or symptoms.
CREATE TABLE worker_assignment_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid REFERENCES intake_cases(case_id) ON DELETE CASCADE,
  village_id uuid REFERENCES villages(village_id),
  district_code text NOT NULL REFERENCES districts(district_code),
  actor_id uuid NOT NULL REFERENCES users(user_id),
  action text NOT NULL,
  target_asha_id uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
