/**
 * FILE: packages/core/src/facilities/freshness.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.7
 * STATUS: STUB — implement assessFreshness
 * PHASE: 2
 *
 * PURPOSE
 *   Convert "when did someone last confirm this facility was working?" into a
 *   band, a 0..1 confidence, and a sentence a citizen can read.
 *
 * THE GUARDRAIL THIS FILE EXISTS TO ENFORCE (critical rule #3)
 *   The system has NO live feed. It must never say a facility is "open",
 *   "available" or "running". It may only say WHAT was reported and HOW LONG
 *   AGO. The reader decides. Every string produced here is evidence + age.
 *
 *   Wrong: "PHC Ramgarh is open."
 *   Right: "An ASHA worker confirmed a doctor here 2 days ago."
 *
 * MAY IMPORT
 *   ./types.ts
 * MUST NOT IMPORT
 *   anything else — no npm packages, no node:* builtins, no Date.now()
 *   (`now` is passed in so results are reproducible in tests)
 *
 * DONE WHEN
 *   node --test "packages/core/src/facilities/freshness.test.ts"  passes
 */

import type { FreshnessAssessment, FreshnessConfig } from "./types.ts";

/**
 * Defaults. tauDays = 14 means confidence halves roughly every 10 days:
 *   exp(-0/14)=1.00   exp(-3/14)=0.81   exp(-7/14)=0.61   exp(-14/14)=0.37
 *   exp(-30/14)=0.12  exp(-90/14)=0.002
 * A three-month-old report is worth almost nothing, which is correct.
 */
export const DEFAULT_FRESHNESS: FreshnessConfig = {
  tauDays: 14,
  freshWithinDays: 3,
  agingWithinDays: 14,
  negativeWindowDays: 7,
  negativeMultiplier: 0.25,
};

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * Assess a facility's evidence freshness.
 *
 * @param lastConfirmedAt ISO 8601, or null if never confirmed
 * @param lastNegativeAt  ISO 8601 of the most recent "closed / no staff" report, or null
 * @param now             ISO 8601 evaluation time (injected — never Date.now())
 *
 * IMPLEMENT — in this order:
 *
 *   1. Parse. Date.parse() on each non-null input. If a value is present but
 *      NaN, treat it as null rather than throwing — bad data must degrade to
 *      UNKNOWN, not crash a triage result.
 *
 *   2. Compute ages in whole days, floored, clamped at >= 0 (a clock-skewed
 *      future timestamp becomes 0, not a negative age):
 *        ageDays = Math.max(0, Math.floor((nowMs - confirmedMs) / DAY_MS))
 *
 *   3. NEGATIVE EVIDENCE WINS when it is recent and not older than the last
 *      confirmation:
 *        if negative exists
 *           && negativeAgeDays <= cfg.negativeWindowDays
 *           && (no confirmation || negativeMs >= confirmedMs)
 *        then return band "REPORTED_CLOSED",
 *             confidence = decay(ageDays ?? negativeAgeDays) * cfg.negativeMultiplier,
 *             ageDays = ageDays (of the confirmation, may be null),
 *             copy    = `Someone reported this facility was not working ${phrase(negativeAgeDays)}.`
 *      A recent "it was shut" outranks an older "it was fine". Asymmetry is
 *      deliberate: false reassurance is the expensive error.
 *
 *   4. NO CONFIRMATION AT ALL:
 *        return { band: "UNKNOWN", confidence: 0.1, ageDays: null,
 *                 copy: "No one has reported on this facility recently." }
 *      Confidence 0.1 rather than 0: an unverified level-4 hospital should still
 *      beat a verified sub-centre for an emergency. Unknown is not disqualifying,
 *      only weak.
 *
 *   5. OTHERWISE band by age:
 *        ageDays <= cfg.freshWithinDays  -> "FRESH"
 *        ageDays <= cfg.agingWithinDays  -> "AGING"
 *        else                            -> "STALE"
 *      confidence = decay(ageDays), rounded to 3 decimals.
 *      copy = `Last confirmed working ${phrase(ageDays)}.`
 *
 * ROUNDING
 *   Round confidence to 3 decimals (Math.round(x * 1000) / 1000) so scores are
 *   stable across platforms and test assertions can use strict equality.
 */
export function assessFreshness(
  lastConfirmedAt: string | null,
  lastNegativeAt: string | null,
  now: string,
  cfg: FreshnessConfig = DEFAULT_FRESHNESS,
): FreshnessAssessment {
  const nowMs = Date.parse(now);

  // Parse confirmed timestamp
  let confirmedMs: number | null = null;
  if (lastConfirmedAt !== null) {
    const parsed = Date.parse(lastConfirmedAt);
    if (!Number.isNaN(parsed)) confirmedMs = parsed;
  }

  // Parse negative timestamp
  let negativeMs: number | null = null;
  if (lastNegativeAt !== null) {
    const parsed = Date.parse(lastNegativeAt);
    if (!Number.isNaN(parsed)) negativeMs = parsed;
  }

  // Age in whole days for the confirmation, clamped >= 0
  const ageDays: number | null =
    confirmedMs !== null ? Math.max(0, Math.floor((nowMs - confirmedMs) / DAY_MS)) : null;

  // Check negative evidence
  if (negativeMs !== null) {
    const negativeAgeDays = Math.max(0, Math.floor((nowMs - negativeMs) / DAY_MS));
    const negativeIsRecent = negativeAgeDays <= cfg.negativeWindowDays;
    const negativeIsNewerOrNoConfirmation = confirmedMs === null || negativeMs >= confirmedMs;
    if (negativeIsRecent && negativeIsNewerOrNoConfirmation) {
      const decayBase = ageDays !== null ? ageDays : negativeAgeDays;
      const confidence =
        Math.round(decayConfidence(decayBase, cfg) * cfg.negativeMultiplier * 1000) / 1000;
      return {
        band: "REPORTED_CLOSED",
        confidence,
        ageDays,
        copy: `Someone reported this facility was not working ${agePhrase(negativeAgeDays)}.`,
      };
    }
  }

  // No confirmation at all
  if (confirmedMs === null) {
    return {
      band: "UNKNOWN",
      confidence: 0.1,
      ageDays: null,
      copy: "No one has reported on this facility recently.",
    };
  }

  // Band by age
  const ageD = ageDays as number;
  const band: FreshnessAssessment["band"] =
    ageD <= cfg.freshWithinDays ? "FRESH" : ageD <= cfg.agingWithinDays ? "AGING" : "STALE";
  const confidence = Math.round(decayConfidence(ageD, cfg) * 1000) / 1000;
  return {
    band,
    confidence,
    ageDays: ageD,
    copy: `Last confirmed working ${agePhrase(ageD)}.`,
  };
}

/**
 * Exponential decay of trust in an observation.
 *
 * IMPLEMENT
 *   return Math.exp(-Math.max(0, ageDays) / cfg.tauDays)
 *
 * Exponential, not linear: trust should fall fast at first (a week-old report is
 * much weaker than a day-old one) and then flatten out (90 days vs 120 days
 * barely differ — both are worthless).
 */
export function decayConfidence(ageDays: number, cfg: FreshnessConfig = DEFAULT_FRESHNESS): number {
  return Math.exp(-Math.max(0, ageDays) / cfg.tauDays);
}

/**
 * Human age phrase used inside `copy`.
 *
 * IMPLEMENT
 *   0  -> "today"
 *   1  -> "yesterday"
 *   <7 -> `${n} days ago`
 *   <14-> "last week"
 *   <60-> `${Math.floor(n / 7)} weeks ago`
 *   else -> `${Math.floor(n / 30)} months ago`
 *
 * Vague on purpose at the long end: "3 months ago" is honest, "94 days ago"
 * implies a precision the underlying report does not have.
 */
export function agePhrase(ageDays: number): string {
  if (ageDays === 0) return "today";
  if (ageDays === 1) return "yesterday";
  if (ageDays < 7) return `${ageDays} days ago`;
  if (ageDays < 14) return "last week";
  if (ageDays < 60) return `${Math.floor(ageDays / 7)} weeks ago`;
  return `${Math.floor(ageDays / 30)} months ago`;
}
