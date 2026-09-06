/**
 * FILE: apps/api/src/modules/triage/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.6
 * STATUS: STUB — implement insertReport
 * PHASE: 3
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function insertReport(
 *     input: CreateReportRequest, result: TriageResult, client?: pg.PoolClient
 *   ): Promise<{ created: boolean }>
 *
 *     INSERT INTO triage_reports (
 *       report_id, device_id, village_id,
 *       age_months, sex, pregnancy_status,
 *       symptom_codes, answers,
 *       tier, decision_source, red_flag_ids,
 *       classifier_score, classifier_features,
 *       ruleset_version, classifier_version,
 *       evaluated_offline, created_at
 *     ) VALUES ($1,...,$17)
 *     ON CONFLICT (report_id) DO NOTHING
 *     RETURNING report_id
 *
 *     created = rows.length > 0
 *
 *   The optional `client` parameter lets sync/push run this inside its
 *   per-operation transaction. Default to the pool when it is absent:
 *       const run = client ? client.query.bind(client) : query
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BINDING NOTES — three that will bite otherwise
 *
 *   1. symptom_codes is text[]. node-postgres maps a JS string[] to it directly.
 *      Do NOT stringify it and do NOT build "{FEVER,COUGH}" by hand.
 *      Same for red_flag_ids: pass result.redFlagHits.map(h => h.ruleId).
 *
 *   2. answers and classifier_features are jsonb. Pass the OBJECT, not
 *      JSON.stringify(obj) — node-postgres serialises it. Stringifying first
 *      stores a JSON *string* inside the jsonb column, and every later query
 *      against it silently returns nothing.
 *
 *   3. classifier_score and classifier_version are NULL when a red flag decided
 *      the outcome (the classifier never ran — GUARDRAIL 8). Bind
 *      result.classifier?.score ?? null, not 0. Zero would mean "scored 0",
 *      which is a different and misleading claim.
 *
 *   ON CONFLICT DO NOTHING is what makes the endpoint idempotent: a device that
 *   retries after a lost response inserts nothing and gets created: false.
 *   Never DO UPDATE — triage_reports is immutable by design (007_triage.sql).
 */

import type pg from "pg";
import type { triage as triageContracts } from "@swasthyasetu/contracts";
import type { TriageResult } from "@swasthyasetu/core";

import { query } from "../../db/pool.ts";

type CreateReportRequest = ReturnType<typeof triageContracts.createReportRequest.parse>;

export async function insertReport(
  input: CreateReportRequest,
  result: TriageResult,
  client?: pg.PoolClient,
): Promise<{ created: boolean }> {
  const run = client
    ? async (sql: string, params: unknown[]) => (await client.query(sql, params)).rows
    : (sql: string, params: unknown[]) => query(sql, params);

  const rows = await run(
    `INSERT INTO triage_reports (
      report_id, device_id, village_id,
      age_months, sex, pregnancy_status,
      symptom_codes, answers,
      tier, decision_source, red_flag_ids,
      classifier_score, classifier_features,
      ruleset_version, classifier_version,
      evaluated_offline, created_at, client_result, server_result
    ) VALUES (
      $1,  $2,  $3,
      $4,  $5,  $6,
      $7,  $8,
      $9,  $10, $11,
      $12, $13,
      $14, $15,
      $16, $17, $18, $19
    )
    ON CONFLICT (report_id) DO NOTHING
    RETURNING report_id`,
    [
      input.reportId,
      input.deviceId ?? null,
      input.villageId ?? null,
      input.encounter.patient.ageMonths,
      input.encounter.patient.sex,
      input.encounter.patient.pregnancy,
      input.encounter.symptoms,             // text[] — pass as-is
      input.encounter.answers,              // jsonb — pass object, not JSON.stringify
      result.tier,
      result.decisionSource,
      result.redFlagHits.map((h: { ruleId: string }) => h.ruleId),
      result.classifier?.score ?? null,
      result.classifier?.features ?? null,  // jsonb — pass object
      result.rulesetVersion,
      result.classifier?.version ?? null,
      input.evaluatedOffline,
      input.createdAt,
      input.result,
      result,
    ],
  );

  return { created: (rows as unknown[]).length > 0 };
}
