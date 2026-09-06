# Migration 011 review

Status: reviewed from source; not approved or applied to another database.

Migration `infra/migrations/011_triage_result_snapshots.sql` adds nullable JSONB
`client_result` and `server_result` columns to `triage_reports`. It performs no
backfill, deletion, reinterpretation of historical results, or change to urgency
rules. Existing rows retain NULL snapshots, meaning they were not captured.

The current `apps/api/src/modules/triage/repo.ts` inserts both snapshots. Deploying
that code against a database without 011 will fail report inserts, including the
sync path. Older code using explicit column lists can coexist with the added
nullable columns. Consumers using positional or `SELECT *` assumptions need a
target-specific compatibility check.

The migration supports preserving the submitted device result alongside server
re-evaluation for audit. It is not a worker-assignment prerequisite by itself;
its necessity comes from the existing report persistence implementation.

Adding columns takes a table lock. Before applying outside the isolated test
database, inspect target migration history, long-running transactions, table
size, application versions and backups; schedule an appropriate deployment
window. Snapshot storage increases retained health-related data and must be
included in the eventual retention and access-control review. No historical
snapshots should be synthesized.

Only the isolated stabilization test database has previously exercised this
migration. This source review does not establish another database's operational
readiness or authorize application there. Keep any subsequent assignment schema
testing isolated as well. Do not run the migration runner against a different
database as an incidental part of Phase 1.
