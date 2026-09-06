-- FILE: infra/migrations/011_triage_result_snapshots.sql
-- PLAN: IMPLEMENTATION_PLAN.md 9.6, 10.3
-- STATUS: Implemented — additive stabilization migration.
-- Preserve the historical device decision and the server's re-evaluation.
-- NULL on older reports means the snapshot was never captured; do not fabricate it.
ALTER TABLE triage_reports ADD COLUMN client_result jsonb;
ALTER TABLE triage_reports ADD COLUMN server_result jsonb;
