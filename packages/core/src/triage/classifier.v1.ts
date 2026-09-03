/**
 * FILE: packages/core/src/triage/classifier.v1.ts
 * PLAN: IMPLEMENTATION_PLAN.md 6.4
 * STATUS: STUB - implement extractFeatures and classify
 * PHASE: 1
 *
 * PURPOSE
 *   Layer 2, for encounters that trigger NO red flag.
 *
 *   There is no labelled training data yet, so v1 is a WEIGHTED SCORECARD, not a
 *   model. It is deterministic, explainable line by line, dependency-free, and it
 *   emits the exact feature vector a trained model would later consume. The
 *   UrgencyClassifier interface below is what makes that swap a one-file change.
 *
 * MAY IMPORT
 *   ./types.ts, ./predicate.ts, ../util/result.ts
 *
 * DONE WHEN
 *   node --test "packages/core/src/triage/classifier.test.ts"  passes
 */

import type { Encounter, UrgencyTier } from "./types.ts";
import { mayBePregnant } from "./predicate.ts";
import { clamp } from "../util/result.ts";

export const CLASSIFIER_VERSION = "classifier-v1.0.0-scorecard";

/** The classifier may never return EMERGENCY - that is red-flag territory. */
export type ClassifierTier = Exclude<UrgencyTier, "EMERGENCY">;

export interface UrgencyClassifier {
  readonly version: string;
  classify(e: Encounter): {
    tier: ClassifierTier;
    score: number;
    features: Record<string, number>;
  };
}

/**
 * Feature weights. Sum of all weights = 13.3 (the maximum possible score).
 * Do not change these without updating classifier.test.ts, which pins three
 * calibration cases.
 */
export const WEIGHTS = {
  symptomBurden: 1.5,
  duration: 1.0,
  feverProlonged: 1.2,
  ageExtreme: 1.5,
  drinkingPoorly: 1.8,
  activityReduced: 1.2,
  mayBePregnant: 1.0,
  chronicIllness: 1.3,
  gettingWorse: 1.6,
  severePain: 1.2,
} as const;

/**
 * Thresholds, deliberately LOW.
 *
 * In this domain the cost of sending someone to a PHC unnecessarily is much
 * lower than the cost of missing a deteriorating child, so v1 over-triages on
 * purpose. This is a recorded safety choice, not an oversight - see
 * docs/SAFETY.md before "optimising" it.
 */
export const THRESHOLD_GO_NOW = 6.0;
export const THRESHOLD_PHC_SOON = 2.5;

/** 5 years in months. */
const CHILD_UNDER_5 = 60;
/** 65 years in months. */
const ELDERLY = 780;

/**
 * Build the feature vector. Every value is in [0, 1].
 *
 * IMPLEMENT - read answers with e.answers[ID], treating missing as 0:
 *   symptomBurden   clamp(e.symptoms.length / 4, 0, 1)
 *   duration        from DURATION_HOURS (number):
 *                     < 24  -> 0
 *                     24..72 inclusive -> 0.5
 *                     > 72  -> 1
 *                     missing / not a number -> 0
 *   feverProlonged  FEVER_DAYS >= 3                       -> 1 else 0
 *   ageExtreme      ageMonths < CHILD_UNDER_5 || >= ELDERLY -> 1 else 0
 *   drinkingPoorly  DRINKING === "poorly"                  -> 1 else 0
 *   activityReduced ACTIVITY === "less_active"             -> 1 else 0
 *   mayBePregnant   mayBePregnant(e)                       -> 1 else 0
 *   chronicIllness  CHRONIC_ILLNESS === true               -> 1 else 0
 *   gettingWorse    GETTING_WORSE === true                 -> 1 else 0
 *   severePain      PAIN_SCORE >= 7                        -> 1 else 0
 *
 * GUARDRAIL
 *   A missing answer contributes 0 and must never throw. Rural users skip
 *   questions constantly; a crash here means no triage answer at all.
 *
 * NOTE
 *   DRINKING === "unable" is handled by RF_UNABLE_TO_DRINK in Layer 1, so this
 *   function only ever sees encounters where drinking is not "unable".
 */
export function extractFeatures(e: Encounter): Record<string, number> {
  const a = e.answers;

  // symptomBurden: clamped to [0,1]
  const symptomBurden = clamp(e.symptoms.length / 4, 0, 1);

  // duration from DURATION_HOURS
  let duration = 0;
  const dh = a["DURATION_HOURS"];
  if (typeof dh === "number") {
    if (dh < 24) duration = 0;
    else if (dh <= 72) duration = 0.5;
    else duration = 1;
  }

  // feverProlonged: FEVER_DAYS >= 3
  const fd = a["FEVER_DAYS"];
  const feverProlonged = typeof fd === "number" && fd >= 3 ? 1 : 0;

  // ageExtreme: < 60 months or >= 780 months
  const ageExtreme =
    e.patient.ageMonths < CHILD_UNDER_5 || e.patient.ageMonths >= ELDERLY ? 1 : 0;

  // drinkingPoorly: DRINKING === "poorly"
  const drinkingPoorly = a["DRINKING"] === "poorly" ? 1 : 0;

  // activityReduced: ACTIVITY === "less_active"
  const activityReduced = a["ACTIVITY"] === "less_active" ? 1 : 0;

  // mayBePregnant
  const mbp = mayBePregnant(e) ? 1 : 0;

  // chronicIllness: CHRONIC_ILLNESS === true
  const chronicIllness = a["CHRONIC_ILLNESS"] === true ? 1 : 0;

  // gettingWorse: GETTING_WORSE === true
  const gettingWorse = a["GETTING_WORSE"] === true ? 1 : 0;

  // severePain: PAIN_SCORE >= 7 (must be a number)
  const ps = a["PAIN_SCORE"];
  const severePain = typeof ps === "number" && ps >= 7 ? 1 : 0;

  return {
    symptomBurden,
    duration,
    feverProlonged,
    ageExtreme,
    drinkingPoorly,
    activityReduced,
    mayBePregnant: mbp,
    chronicIllness,
    gettingWorse,
    severePain,
  };
}

/**
 * The v1 scorecard classifier.
 *
 * IMPLEMENT classify()
 *   1. features = extractFeatures(e)
 *   2. score = sum over keys of WEIGHTS[k] * (features[k] ?? 0)
 *   3. tier = score >= THRESHOLD_GO_NOW    ? "GO_NOW"
 *           : score >= THRESHOLD_PHC_SOON  ? "PHC_SOON"
 *           : "SELF_CARE"
 *   4. Return { tier, score, features }.
 *
 * INVARIANTS the tests check
 *   - never returns EMERGENCY (type system enforces it too)
 *   - identical input -> identical output
 *   - monotonic: adding a symptom or a concerning answer never LOWERS the score
 *   - missing answers contribute 0, never throw
 */
export const classifierV1: UrgencyClassifier = {
  version: CLASSIFIER_VERSION,
  classify(e: Encounter) {
    const features = extractFeatures(e);
    let score = 0;
    for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
      score += WEIGHTS[key] * (features[key] ?? 0);
    }
    const tier: ClassifierTier =
      score >= THRESHOLD_GO_NOW
        ? "GO_NOW"
        : score >= THRESHOLD_PHC_SOON
          ? "PHC_SOON"
          : "SELF_CARE";
    return { tier, score, features };
  },
};
