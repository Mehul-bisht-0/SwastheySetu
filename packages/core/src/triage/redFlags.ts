/**
 * FILE: packages/core/src/triage/redFlags.ts
 * PLAN: IMPLEMENTATION_PLAN.md 6.3
 * STATUS: STUB - implement evaluateRedFlags
 * PHASE: 1
 *
 * PURPOSE
 *   Run every red-flag rule against an encounter and return ALL matches.
 *   This is Layer 1: deterministic, versioned, safety-critical.
 *
 * MAY IMPORT
 *   ./types.ts, ./predicate.ts
 * MUST NOT IMPORT
 *   ./classifier.v1.ts  (Layer 1 never consults Layer 2)
 *   anything outside packages/core
 *
 * DONE WHEN
 *   node --test "packages/core/src/triage/redFlags.test.ts"  passes
 */

import type { Encounter, RedFlagHit, UrgencyTier } from "./types.ts";
import { TIER_SEVERITY } from "./types.ts";
import type { Predicate } from "./predicate.ts";
import { evalPredicate } from "./predicate.ts";

/** A single red-flag rule. Rules live in ruleset.v1.ts as data. */
export interface RedFlagRule {
  id: string;
  /** Only EMERGENCY or GO_NOW. A red flag never yields PHC_SOON or SELF_CARE. */
  tier: "EMERGENCY" | "GO_NOW";
  /** Plain language, shown verbatim to the user. No jargon, no disease names. */
  label: string;
  advice: string[];
  when: Predicate;
}

/**
 * Evaluate all rules and return every hit, in ruleset order.
 *
 * IMPLEMENT
 *   1. Filter `rules` to those where evalPredicate(rule.when, e) is true.
 *   2. Map each to a RedFlagHit { ruleId: rule.id, label, advice }.
 *   3. Preserve ruleset order so output is stable and testable.
 *   4. Return [] when nothing matches. Never throw for "no match" - that is a
 *      normal outcome, not an error.
 *
 * GUARDRAIL
 *   Collect ALL hits, not just the first. The "why this result" screen lists
 *   every reason, and stopping early would hide relevant advice.
 */
export function evaluateRedFlags(
  e: Encounter,
  rules: readonly RedFlagRule[],
): RedFlagHit[] {
  return rules
    .filter((rule) => evalPredicate(rule.when, e))
    .map((rule) => ({ ruleId: rule.id, label: rule.label, advice: rule.advice }));
}

/**
 * Most severe tier among the given rules that matched.
 *
 * IMPLEMENT
 *   Return undefined when hits is empty.
 *   Otherwise look up each hit's rule tier and return the one with the highest
 *   TIER_SEVERITY value.
 *
 * Note: `hits` carries ruleId, so map back through `rules` to read each tier.
 */
export function mostSevereTier(
  hits: RedFlagHit[],
  rules: readonly RedFlagRule[],
): UrgencyTier | undefined {
  if (hits.length === 0) return undefined;
  let best: UrgencyTier = "GO_NOW";
  for (const hit of hits) {
    const rule = rules.find((r) => r.id === hit.ruleId);
    if (!rule) continue;
    if (TIER_SEVERITY[rule.tier] > TIER_SEVERITY[best]) {
      best = rule.tier;
    }
  }
  return best;
}
