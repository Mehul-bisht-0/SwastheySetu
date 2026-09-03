/**
 * FILE: packages/core/src/triage/evaluate.ts
 * PLAN: IMPLEMENTATION_PLAN.md 6.5
 * STATUS: STUB - implement evaluateTriage
 * PHASE: 1
 *
 * PURPOSE
 *   The single entry point to the decision engine. Both the mobile app (offline)
 *   and the API (online) call THIS function. Same code, same answer - which is
 *   what makes offline triage trustworthy rather than a degraded fallback.
 *
 * MAY IMPORT
 *   ./types.ts, ./redFlags.ts, ./ruleset.v1.ts, ./classifier.v1.ts, ../util/clock.ts
 * MUST NOT IMPORT
 *   any LLM client, any network code, anything outside packages/core.
 *   GUARDRAIL 1: no code path from triage may reach a language model.
 *
 * DONE WHEN
 *   node --test "packages/core/src/triage/evaluate.test.ts"  passes
 *   and the scenario fixtures in tests/scenarios/ all pass.
 */

import type { Encounter, TriageResult } from "./types.ts";
import { NON_DIAGNOSTIC_DISCLAIMER } from "./types.ts";
import type { RedFlagRule } from "./redFlags.ts";
import { evaluateRedFlags, mostSevereTier } from "./redFlags.ts";
import { RULES, RULESET_VERSION } from "./ruleset.v1.ts";
import type { UrgencyClassifier } from "./classifier.v1.ts";
import { classifierV1 } from "./classifier.v1.ts";
import type { Clock } from "../util/clock.ts";

export interface TriageDeps {
  clock: Clock;
  /** Defaults to RULES from ruleset.v1. Injectable so tests can use fixtures. */
  rules?: readonly RedFlagRule[];
  /** Defaults to classifierV1. Injectable for the future trained model. */
  classifier?: UrgencyClassifier;
}

/**
 * Evaluate an encounter into an urgency tier.
 *
 * IMPLEMENT - this ORDER IS THE SAFETY PROPERTY and must not change:
 *
 *   1. rules = deps.rules ?? RULES
 *      hits  = evaluateRedFlags(e, rules)          // ALL hits, not the first
 *
 *   2. IF hits.length > 0:
 *        tier           = mostSevereTier(hits, rules)
 *        decisionSource = "RED_FLAG"
 *        advice         = deduplicated, order-preserving concat of every hit's advice
 *        RETURN NOW. Do not run the classifier at all.
 *
 *   3. ELSE:
 *        out = (deps.classifier ?? classifierV1).classify(e)
 *        tier           = out.tier
 *        decisionSource = "CLASSIFIER"
 *        classifier     = { score: out.score, features: out.features, version }
 *        advice         = adviceForTier(tier)
 *
 *   4. ALWAYS stamp: rulesetVersion = RULESET_VERSION,
 *                    evaluatedAt    = deps.clock.now().toISOString(),
 *                    disclaimer     = NON_DIAGNOSTIC_DISCLAIMER
 *
 * GUARDRAIL 8
 *   The classifier can never lower or override a red-flag tier. If a red flag
 *   fired, step 3 must not execute - not "runs but is ignored", but genuinely
 *   never called. evaluate.test.ts proves this with a throwing stub classifier.
 */
export function evaluateTriage(e: Encounter, deps: TriageDeps): TriageResult {
  const rules = deps.rules ?? RULES;
  const hits = evaluateRedFlags(e, rules);

  const base = {
    rulesetVersion: RULESET_VERSION,
    evaluatedAt: deps.clock.now().toISOString(),
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  };

  if (hits.length > 0) {
    const tier = mostSevereTier(hits, rules) ?? "GO_NOW";
    // Deduplicate advice strings — order-preserving, first occurrence wins
    const seen = new Set<string>();
    const advice: string[] = [];
    for (const hit of hits) {
      for (const line of hit.advice) {
        if (!seen.has(line)) {
          seen.add(line);
          advice.push(line);
        }
      }
    }
    return {
      ...base,
      tier,
      decisionSource: "RED_FLAG",
      redFlagHits: hits,
      advice,
    };
  }

  const classifier = deps.classifier ?? classifierV1;
  const out = classifier.classify(e);
  return {
    ...base,
    tier: out.tier,
    decisionSource: "CLASSIFIER",
    redFlagHits: [],
    classifier: { score: out.score, features: out.features, version: classifier.version },
    advice: adviceForTier(out.tier),
  };
}

/**
 * Default advice when the classifier decided the tier.
 *
 * IMPLEMENT - return action-oriented copy per tier, no disease names:
 *   GO_NOW    "Go to a health facility today." / "Do not wait until tomorrow."
 *   PHC_SOON  "Visit your nearest PHC in the next day or two."
 *   SELF_CARE "You can care for this at home for now." plus rest/fluids advice.
 *   EMERGENCY unreachable here - the classifier cannot return it. Throw if seen.
 *
 * NOTE
 *   The SELF_CARE screen must ALSO show a "come back immediately if..." danger
 *   sign list, built from red-flag labels. That is a UI responsibility
 *   (see plan 11.4), not this function's - but do not let SELF_CARE read as a
 *   dismissal anywhere. It is a conditional discharge.
 */
export function adviceForTier(tier: TriageResult["tier"]): string[] {
  switch (tier) {
    case "GO_NOW":
      return [
        "Go to a health facility today.",
        "Do not wait until tomorrow.",
        "Bring someone with you if you can.",
      ];
    case "PHC_SOON":
      return [
        "Visit your nearest PHC in the next day or two.",
        "Keep an eye on how you feel, and go sooner if things get worse.",
      ];
    case "SELF_CARE":
      return [
        "You can care for this at home for now.",
        "Rest and drink plenty of fluids.",
        "Come back immediately if you feel worse or new symptoms appear.",
      ];
    case "EMERGENCY":
      throw new Error("adviceForTier: EMERGENCY is red-flag territory — the classifier cannot return it");
  }
}
