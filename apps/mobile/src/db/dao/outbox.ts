import { getDb, tx } from "../client.ts";
import type { SyncOpType } from "@swasthyasetu/core";

export interface OutboxOp {
  clientOpId: string;
  opType: SyncOpType;
  payload: unknown;
  clientCreatedAt: string;
}

export interface OutboxRow extends OutboxOp {
  status: "PENDING" | "SENDING" | "REJECTED";
  attempts: number;
  lastError: string | null;
}

export function enqueue(op: OutboxOp, alsoWrite?: (db: ReturnType<typeof getDb>) => void): void {
  tx((db) => {
    alsoWrite?.(db);
    db.runSync(
      "INSERT INTO outbox (client_op_id, op_type, payload, client_created_at) VALUES (?, ?, ?, ?)",
      [op.clientOpId, op.opType, JSON.stringify(op.payload), op.clientCreatedAt],
    );
  });
}

export function claimBatch(limit = 50, ignoreBackoff = false): OutboxRow[] {
  return tx((db) => {
  const now = Date.now();
  const rows = (db.getAllSync(
    "SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY client_created_at ASC, rowid",
  ) as Array<{ client_op_id: string; op_type: string; payload: string; client_created_at: string; status: string; attempts: number; last_error: string | null; last_attempt_at: string | null }>)
    .filter(r => ignoreBackoff || r.last_attempt_at === null || now - Date.parse(r.last_attempt_at) >= backoffDelayMs(r.attempts))
    .slice(0, limit);
  if (rows.length === 0) return [];
  for (const row of rows) db.runSync("UPDATE outbox SET status='SENDING', last_attempt_at=? WHERE client_op_id=?", [new Date(now).toISOString(), row.client_op_id]);
  return rows.map((r) => ({
    clientOpId: r.client_op_id,
    opType: r.op_type as SyncOpType,
    payload: JSON.parse(r.payload) as unknown,
    clientCreatedAt: r.client_created_at,
    status: "SENDING" as const,
    attempts: r.attempts,
    lastError: r.last_error,
  }));
  });
}

export function applyResults(results: Array<{ clientOpId: string; status: string; errorCode?: string; message?: string }>): void {
  tx((db) => {
    for (const r of results) {
      if (r.status === "APPLIED" || r.status === "DUPLICATE") {
        db.runSync("UPDATE triage_reports_local SET pending = 0 WHERE report_id = (SELECT json_extract(payload, '$.reportId') FROM outbox WHERE client_op_id = ?)", [r.clientOpId]);
        db.runSync("UPDATE household_visits_local SET pending = 0 WHERE visit_id = (SELECT json_extract(payload, '$.visitId') FROM outbox WHERE client_op_id = ?) AND entity_version = (SELECT json_extract(payload, '$.entityVersion') FROM outbox WHERE client_op_id = ?)", [r.clientOpId, r.clientOpId]);
        db.runSync("UPDATE signals_local SET pending = 0 WHERE signal_id = (SELECT json_extract(payload, '$.activityId') FROM outbox WHERE client_op_id = ?)", [r.clientOpId]);
        db.runSync("DELETE FROM outbox WHERE client_op_id = ?", [r.clientOpId]);
      } else if (r.status === "CONFLICT") {
        db.runSync("UPDATE household_visits_local SET conflict=1, pending=0 WHERE visit_id=(SELECT json_extract(payload,'$.visitId') FROM outbox WHERE client_op_id=?) AND entity_version=(SELECT json_extract(payload,'$.entityVersion') FROM outbox WHERE client_op_id=?)", [r.clientOpId, r.clientOpId]);
        db.runSync("DELETE FROM outbox WHERE client_op_id=?", [r.clientOpId]);
      } else if (r.status === "REJECTED") {
        db.runSync("UPDATE outbox SET status='REJECTED', last_error=? WHERE client_op_id=?", [r.message ?? r.errorCode ?? "REJECTED", r.clientOpId]);
      }
    }
  });
}

export function releaseBatch(ids: string[], error: string): void {
  const now = new Date().toISOString();
  tx((db) => {
    for (const id of ids) {
      db.runSync("UPDATE outbox SET status='PENDING', attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE client_op_id = ?", [now, error, id]);
    }
  });
}

export function releaseStale(): void {
  // Called once at startup, before the runner: no request from this process is in flight.
  getDb().runSync("UPDATE outbox SET status='PENDING', last_attempt_at=NULL WHERE status='SENDING'");
}

export function counts(): { pending: number; rejected: number } {
  const row = getDb().getFirstSync("SELECT COUNT(*) AS pending FROM outbox WHERE status IN ('PENDING','SENDING')") as { pending: number } | null;
  const row2 = getDb().getFirstSync("SELECT COUNT(*) AS rejected FROM outbox WHERE status='REJECTED'") as { rejected: number } | null;
  return { pending: row?.pending ?? 0, rejected: row2?.rejected ?? 0 };
}

export function backoffDelayMs(attempts: number): number {
  const base = Math.min(Math.pow(2, attempts) * 5000, 900000);
  return Math.floor(base * (1 + 0.2 * Math.random()));
}
