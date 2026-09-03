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

export function claimBatch(limit = 50): OutboxRow[] {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const db = getDb();
  const rows = db.getAllSync(
    "SELECT * FROM outbox WHERE status = 'PENDING' AND (last_attempt_at IS NULL OR last_attempt_at < ?) ORDER BY client_created_at ASC LIMIT ?",
    [cutoff, limit],
  ) as Array<{ client_op_id: string; op_type: string; payload: string; client_created_at: string; status: string; attempts: number; last_error: string | null }>;
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const ids = rows.map((r) => r.client_op_id);
  db.runSync("UPDATE outbox SET status='SENDING' WHERE client_op_id IN (" + placeholders + ")", ids);
  return rows.map((r) => ({
    clientOpId: r.client_op_id,
    opType: r.op_type as SyncOpType,
    payload: JSON.parse(r.payload) as unknown,
    clientCreatedAt: r.client_created_at,
    status: r.status as OutboxRow["status"],
    attempts: r.attempts,
    lastError: r.last_error,
  }));
}

export function applyResults(results: Array<{ clientOpId: string; status: string; errorCode?: string }>): void {
  tx((db) => {
    for (const r of results) {
      if (r.status === "APPLIED" || r.status === "DUPLICATE") {
        db.runSync("DELETE FROM outbox WHERE client_op_id = ?", [r.clientOpId]);
        db.runSync("UPDATE triage_reports_local SET pending = 0 WHERE report_id = (SELECT json_extract(payload, '$.reportId') FROM outbox WHERE client_op_id = ?)", [r.clientOpId]);
        db.runSync("UPDATE household_visits_local SET pending = 0 WHERE visit_id = (SELECT json_extract(payload, '$.visitId') FROM outbox WHERE client_op_id = ?)", [r.clientOpId]);
      } else if (r.status === "REJECTED") {
        db.runSync("UPDATE outbox SET status='REJECTED', last_error=? WHERE client_op_id=?", [r.errorCode ?? "REJECTED", r.clientOpId]);
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
  const cutoff = new Date(Date.now() - 300000).toISOString();
  getDb().runSync("UPDATE outbox SET status='PENDING' WHERE status='SENDING' AND last_attempt_at < ?", [cutoff]);
}

export function counts(): { pending: number; rejected: number } {
  const row = getDb().getFirstSync("SELECT COUNT(*) AS pending FROM outbox WHERE status='PENDING'") as { pending: number } | null;
  const row2 = getDb().getFirstSync("SELECT COUNT(*) AS rejected FROM outbox WHERE status='REJECTED'") as { rejected: number } | null;
  return { pending: row?.pending ?? 0, rejected: row2?.rejected ?? 0 };
}

export function backoffDelayMs(attempts: number): number {
  const base = Math.min(Math.pow(2, attempts) * 5000, 900000);
  return Math.floor(base * (1 + 0.2 * Math.random()));
}