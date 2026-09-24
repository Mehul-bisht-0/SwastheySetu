-- Additive mobile schema extension. The COMPLETE base schema.sql is intentionally untouched.
CREATE TABLE IF NOT EXISTS patient_operation_outbox (
  operation_id TEXT PRIMARY KEY,
  op_type TEXT NOT NULL CHECK(op_type IN ('CONSENT_DECIDE','CONSENT_REVOKE','CARE_CONTEXT_LINK')),
  client_created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REJECTED')),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS patient_operation_due_idx ON patient_operation_outbox(status,next_attempt_at,client_created_at);

CREATE TABLE IF NOT EXISTS diagnostic_reference_cache (
  service_id TEXT PRIMARY KEY,
  district_code TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS diagnostic_reference_district_idx ON diagnostic_reference_cache(district_code,refreshed_at);

CREATE TABLE IF NOT EXISTS diagnostic_signal_outbox (
  operation_id TEXT PRIMARY KEY,
  client_created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REJECTED')),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS diagnostic_signal_due_idx ON diagnostic_signal_outbox(status,next_attempt_at,client_created_at);

INSERT OR REPLACE INTO app_meta(key,value) VALUES('schema.connectivity.version','1');
