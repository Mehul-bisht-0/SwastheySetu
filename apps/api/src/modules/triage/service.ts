/**
 * FILE: apps/api/src/modules/triage/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.6
 * STATUS: STUB — implement evaluate and createReport
 * PHASE: 3
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THIS FILE CONTAINS NO CLINICAL LOGIC AND MUST NEVER CONTAIN ANY.
 *
 *  It calls `evaluateTriage` from @swasthyasetu/core and stores the answer.
 *  Every rule, threshold and tier lives in packages/core, where it is
 *  dependency-free, unit-tested, and runs identically on the phone.
 *
 *  If you are about to write `if (tier === "EMERGENCY")` to change an outcome
 *  here, you are forking the decision engine: the server and the phone will
 *  start disagreeing, and the offline answer — the one a user actually sees
 *  first — will be the wrong one.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MAY IMPORT   @swasthyasetu/core, @swasthyasetu/contracts, ./repo.ts,
 *              ../../plugins/errors.ts
 * MUST NOT IMPORT  any AI/LLM client, any HTTP client, ../rag/*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export function evaluate(encounter: Encounter): TriageResult
 *
 *     return evaluateTriage(encounter, {
 *       rules: RULES,
 *       rulesetVersion: RULESET_VERSION,
 *       classifier: classifierV1,
 *       clock: systemClock,
 *     });
 *
 *     That is the whole function. Synchronous, no database, no await. Resist
 *     making it async "for consistency" — an async signature invites someone to
 *     put a network call inside it later.
 *
 *   export async function createReport(input: CreateReportRequest): Promise<CreateReportResponse>
 *
 *     1. RE-EVALUATE SERVER-SIDE, do not trust input.result:
 *          const server = evaluate(input.encounter)
 *        Then compare server.tier with input.result.tier.
 *          - equal   -> store the result, nothing to say
 *          - differ  -> STORE THE SERVER'S RESULT and log a WARN with both tiers
 *                       and both ruleset versions. This is not an error: it is
 *                       exactly what happens when a phone is two app versions
 *                       behind, and the mismatch count is the metric that tells
 *                       you how stale the field devices are. Do NOT reject the
 *                       report — rejecting it loses a real encounter to protect
 *                       a version number.
 *
 *     2. Persist via repo.insertReport(). Idempotent on reportId.
 *     3. Return { reportId, created } where `created` is false if the row
 *        already existed, so the device stops retrying.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FEATURE VECTOR IS STORED
 *   `classifier_features` in 007_triage.sql is the Layer-2 upgrade path made
 *   real: export the rows, have a clinician label the outcomes, train a model,
 *   and swap the implementation behind the same `UrgencyClassifier` interface.
 *   Dropping the column would make that a fresh data-collection project.
 */

import type { triage as triageContracts } from "@swasthyasetu/contracts";
import type { Encounter, TriageResult } from "@swasthyasetu/core";
import {
  RULES,
  RULESET_VERSION,
  classifierV1,
  evaluateTriage,
  systemClock,
} from "@swasthyasetu/core";

import { insertReport } from "./repo.ts";

type CreateReportRequest = ReturnType<typeof triageContracts.createReportRequest.parse>;
type CreateReportResponse = ReturnType<typeof triageContracts.createReportResponse.parse>;

export function evaluate(encounter: Encounter): TriageResult {
  return evaluateTriage(encounter, {
    rules: RULES,
    clock: systemClock,
    classifier: classifierV1,
  });
}

export async function createReport(
  input: CreateReportRequest,
): Promise<CreateReportResponse> {
  // Always re-evaluate server-side — never trust the client's result
  const serverResult = evaluate(input.encounter);

  if (serverResult.tier !== input.result.tier) {
    // Log the mismatch as a warning; store the server's result regardless
    console.warn({
      msg: "triage_mismatch",
      reportId: input.reportId,
      clientTier: input.result.tier,
      serverTier: serverResult.tier,
      clientRuleset: input.result.rulesetVersion,
      serverRuleset: serverResult.rulesetVersion,
    });
  }

  const { created } = await insertReport(input, serverResult);
  return { reportId: input.reportId, created };
}
