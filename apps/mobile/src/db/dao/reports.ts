import { getDb } from "../client.ts";
import { enqueue } from "./outbox.ts";
import type { Encounter, TriageResult } from "@swasthyasetu/core";

export interface SaveReportInput {
  villageId: string | null;
  encounter: Encounter;
  result: TriageResult;
}

export interface ReportRow {
  reportId: string;
  tier: string;
  createdAt: string;
  pending: boolean;
  encounter: Encounter;
  result: TriageResult;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function saveReport(input: SaveReportInput): string {
  const reportId = uuid();
  const clientOpId = uuid();
  const now = new Date().toISOString();
  const payload = {
    reportId,
    villageId: input.villageId,
    encounter: {
      patient: input.encounter.patient,
      symptoms: input.encounter.symptoms,
      answers: input.encounter.answers,
    },
    result: input.result,
    evaluatedOffline: true,
    createdAt: now,
  };
  enqueue(
    { clientOpId, opType: "TRIAGE_REPORT_CREATE", payload, clientCreatedAt: now },
    (db) => {
      db.runSync(
        "INSERT INTO triage_reports_local (report_id, village_id, encounter_json, result_json, tier, ruleset_version, created_at, pending) VALUES (?,?,?,?,?,?,?,1)",
        [reportId, input.villageId ?? null, JSON.stringify(input.encounter), JSON.stringify(input.result), input.result.tier, input.result.rulesetVersion, now],
      );
    },
  );
  return reportId;
}

export function listRecent(limit = 20): ReportRow[] {
  return getDb().getAllSync(
    "SELECT report_id, tier, created_at, pending, encounter_json, result_json FROM triage_reports_local ORDER BY created_at DESC LIMIT ?",
    [limit],
  ).map((r: unknown) => {
    const row = r as { report_id: string; tier: string; created_at: string; pending: number; encounter_json: string; result_json: string };
    return {
      reportId: row.report_id,
      tier: row.tier,
      createdAt: row.created_at,
      pending: row.pending === 1,
      encounter: JSON.parse(row.encounter_json) as Encounter,
      result: JSON.parse(row.result_json) as TriageResult,
    };
  });
}

export function getReport(reportId: string): ReportRow | null {
  const row = getDb().getFirstSync(
    "SELECT report_id, tier, created_at, pending, encounter_json, result_json FROM triage_reports_local WHERE report_id = ?",
    [reportId],
  ) as { report_id: string; tier: string; created_at: string; pending: number; encounter_json: string; result_json: string } | null;
  if (!row) return null;
  return {
    reportId: row.report_id,
    tier: row.tier,
    createdAt: row.created_at,
    pending: row.pending === 1,
    encounter: JSON.parse(row.encounter_json) as Encounter,
    result: JSON.parse(row.result_json) as TriageResult,
  };
}

export function markSent(reportId: string): void {
  getDb().runSync("UPDATE triage_reports_local SET pending = 0 WHERE report_id = ?", [reportId]);
}
