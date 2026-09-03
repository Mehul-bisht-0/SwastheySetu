import { getDb, tx } from "../client.ts";
import { enqueue } from "./outbox.ts";

export interface UpsertVisitInput {
  householdCode: string;
  villageId: string;
  visitedAt: string;
  payload: Record<string, unknown>;
}

export interface VisitRow {
  visitId: string;
  householdCode: string;
  villageId: string;
  visitedAt: string;
  entityVersion: number;
  pending: boolean;
  conflict: boolean;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function upsertVisit(input: UpsertVisitInput): string {
  const existing = getDb().getFirstSync(
    "SELECT visit_id, entity_version FROM household_visits_local WHERE village_id=? AND household_code=?",
    [input.villageId, input.householdCode],
  ) as { visit_id: string; entity_version: number } | null;

  const visitId = existing?.visit_id ?? uuid();
  const entityVersion = (existing?.entity_version ?? 0) + 1;
  const now = new Date().toISOString();
  const clientOpId = uuid();
  const payload = { visitId, householdCode: input.householdCode, villageId: input.villageId, visitedAt: input.visitedAt, entityVersion, ...input.payload };

  enqueue(
    { clientOpId, opType: "HOUSEHOLD_VISIT_UPSERT", payload, clientCreatedAt: now },
    (db) => {
      db.runSync(
        `INSERT INTO household_visits_local (visit_id, household_code, village_id, visited_at, entity_version, payload_json, pending, conflict)
         VALUES (?,?,?,?,?,?,1,0)
         ON CONFLICT(village_id, household_code) DO UPDATE SET
           visited_at=excluded.visited_at, entity_version=excluded.entity_version,
           payload_json=excluded.payload_json, pending=1, conflict=0`,
        [visitId, input.householdCode, input.villageId, input.visitedAt, entityVersion, JSON.stringify(payload)],
      );
    },
  );
  return visitId;
}

export function listVisits(opts: { villageId?: string; since?: string; limit?: number }): VisitRow[] {
  const limit = opts.limit ?? 50;
  const rows = getDb().getAllSync(
    "SELECT * FROM household_visits_local WHERE (? IS NULL OR village_id=?) AND (? IS NULL OR visited_at>=?) ORDER BY visited_at DESC LIMIT ?",
    [opts.villageId ?? null, opts.villageId ?? null, opts.since ?? null, opts.since ?? null, limit],
  ) as Array<{ visit_id: string; household_code: string; village_id: string; visited_at: string; entity_version: number; pending: number; conflict: number }>;
  return rows.map((r) => ({
    visitId: r.visit_id,
    householdCode: r.household_code,
    villageId: r.village_id,
    visitedAt: r.visited_at,
    entityVersion: r.entity_version,
    pending: r.pending === 1,
    conflict: r.conflict === 1,
  }));
}

export function markConflict(visitId: string): void {
  getDb().runSync("UPDATE household_visits_local SET conflict=1 WHERE visit_id=?", [visitId]);
}

export function markSent(visitId: string): void {
  getDb().runSync("UPDATE household_visits_local SET pending=0 WHERE visit_id=?", [visitId]);
}