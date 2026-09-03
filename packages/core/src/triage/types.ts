/**
 * FILE: packages/core/src/triage/types.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.1
 * STATUS: COMPLETE — do not modify
 *
 * The shared vocabulary of the decision engine. Everything else in triage/
 * imports from here. If your implementation disagrees with a type in this file,
 * the implementation is wrong.
 */

export type Sex = "male" | "female" | "other" | "unknown";
export type Pregnancy = "yes" | "no" | "unknown";

/**
 * Age is ALWAYS in months.
 *
 * One canonical unit removes every "is this a child?" ambiguity — there is no
 * place in this codebase where a number could be either years or months.
 * Reference points: 2 months = 2, 5 years = 60, 12 years = 144, 35 years = 420,
 * 50 years = 600, 65 years = 780.
 */
export interface PatientContext {
  ageMonths: number;
  sex: Sex;
  pregnancy: Pregnancy;
}

export type SymptomCode =
  | "FEVER"
  | "COUGH"
  | "FAST_BREATHING"
  | "DIARRHOEA"
  | "VOMITING"
  | "CONVULSION"
  | "UNCONSCIOUS"
  | "NOT_FEEDING"
  | "CHEST_PAIN"
  | "BLEEDING_HEAVY"
  | "SEVERE_ABDOMINAL_PAIN"
  | "RASH"
  | "INJURY"
  | "SWELLING_FACE_HANDS"
  | "BLURRED_VISION"
  | "REDUCED_FETAL_MOVEMENT"
  | "WEAKNESS_ONE_SIDE"
  | "DIFFICULTY_SPEAKING"
  | "BURNING_URINATION";

export type AnswerValue = string | number | boolean;

/** Everything the decision engine is allowed to see. */
export interface Encounter {
  patient: PatientContext;
  symptoms: SymptomCode[];
  /** Follow-up answers keyed by question id, e.g. { DURATION_HOURS: 30, DRINKING: "poorly" } */
  answers: Record<string, AnswerValue | undefined>;
}

/**
 * Urgency tiers, most to least severe.
 * EMERGENCY is reachable ONLY through a red-flag rule — the classifier may
 * never return it. See §6.4.
 */
export type UrgencyTier = "EMERGENCY" | "GO_NOW" | "PHC_SOON" | "SELF_CARE";

/** Severity ordering for "take the most severe hit". Higher = more urgent. */
export const TIER_SEVERITY: Record<UrgencyTier, number> = {
  SELF_CARE: 0,
  PHC_SOON: 1,
  GO_NOW: 2,
  EMERGENCY: 3,
};

export interface RedFlagHit {
  ruleId: string;
  /** Plain language, shown verbatim on the "why" screen. No jargon, no disease name. */
  label: string;
  advice: string[];
}

export interface ClassifierOutput {
  score: number;
  features: Record<string, number>;
  version: string;
}

export interface TriageResult {
  tier: UrgencyTier;
  decisionSource: "RED_FLAG" | "CLASSIFIER";
  /** ALL matching red flags, not just the first — the why-screen lists them all. */
  redFlagHits: RedFlagHit[];
  /** Absent when a red flag decided the outcome (the classifier was never run). */
  classifier?: ClassifierOutput;
  rulesetVersion: string;
  advice: string[];
  /** Constant non-diagnostic notice. ALWAYS populated. See NON_DIAGNOSTIC_DISCLAIMER. */
  disclaimer: string;
  /** ISO 8601, from the injected Clock — never Date.now(). */
  evaluatedAt: string;
}

/**
 * GUARDRAIL (critical rule #4): the system is non-diagnostic. This string ships
 * on every result and is rendered visibly on the TriageResult screen.
 */
export const NON_DIAGNOSTIC_DISCLAIMER =
  "This is not a diagnosis. It is a guide to how soon to seek care. " +
  "If you are worried, seek care anyway.";
