-- FILE: infra/migrations/009_sync.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.9, 10.3
-- STATUS: COMPLETE - do not modify
--
-- The idempotency ledger. `result` is replayed VERBATIM when a duplicate
-- client_op_id arrives, so a client that never saw the first reply still
-- converges instead of double-writing.
--
-- Note the asymmetry with the API: status here is only APPLIED or REJECTED.
-- The wire protocol can also answer DUPLICATE and CONFLICT, and both are
-- statements about THIS REQUEST, not about the stored operation:
--   DUPLICATE -> this client_op_id was already present; the stored row still
--                says APPLIED, and its `result` is replayed verbatim.
--   CONFLICT  -> a stale entity_version lost a last-write-wins race. Stored as
--                REJECTED with error_code = 'VERSION_CONFLICT' and the current
--                server state in `result` so the device can reconcile.

CREATE TABLE sync_operations (
  client_op_id uuid PRIMARY KEY,          -- idempotency key, client-generated
  device_id    text NOT NULL,
  user_id      uuid REFERENCES users(user_id) ON DELETE SET NULL,
  -- MIRRORS SyncOpType in packages/core/src/sync/types.ts. Keep the two lists
  -- byte-identical; an op_type the server does not recognise must be rejected
  -- loudly, never dropped. UPSERT rather than CREATE/UPDATE because a device
  -- that is offline for a week may create and then edit the same visit before
  -- either version has ever reached the server.
  op_type      text NOT NULL CHECK (op_type IN
                 ('TRIAGE_REPORT_CREATE','HOUSEHOLD_VISIT_UPSERT','FACILITY_SIGNAL_CREATE')),
  payload_hash text NOT NULL,             -- sha256 of canonicalize(payload)
  status       text NOT NULL CHECK (status IN ('APPLIED','REJECTED')),
  result       jsonb NOT NULL,
  error_code   text,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sync_ops_device_idx ON sync_operations (device_id, received_at DESC);
