/**
 * FILE: packages/core/src/index.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6
 * STATUS: COMPLETE - do not modify
 *
 * The public surface of the domain layer. apps/api and apps/mobile import from
 * here and nowhere deeper, so internals can move without breaking consumers.
 */

// --- triage (decision engine) ---
export type {
  Sex,
  Pregnancy,
  PatientContext,
  SymptomCode,
  AnswerValue,
  Encounter,
  UrgencyTier,
  RedFlagHit,
  ClassifierOutput,
  TriageResult,
} from "./triage/types.ts";
export { TIER_SEVERITY, NON_DIAGNOSTIC_DISCLAIMER } from "./triage/types.ts";

export type { Predicate } from "./triage/predicate.ts";
export { evalPredicate, mayBePregnant } from "./triage/predicate.ts";

export type { RedFlagRule } from "./triage/redFlags.ts";
export { evaluateRedFlags, mostSevereTier } from "./triage/redFlags.ts";

export { RULES, RULESET_VERSION } from "./triage/ruleset.v1.ts";

export type { UrgencyClassifier, ClassifierTier } from "./triage/classifier.v1.ts";
export {
  classifierV1,
  extractFeatures,
  CLASSIFIER_VERSION,
  WEIGHTS,
  THRESHOLD_GO_NOW,
  THRESHOLD_PHC_SOON,
} from "./triage/classifier.v1.ts";

export type { TriageDeps } from "./triage/evaluate.ts";
export { evaluateTriage, adviceForTier } from "./triage/evaluate.ts";

// --- facilities (routing engine) ---
export type {
  CapabilityLevel,
  CapabilityRequirement,
  FreshnessBand,
  FreshnessConfig,
  FreshnessAssessment,
  FacilityCandidate,
  RankedFacility,
  RankingOutcome,
  RankingConfig,
} from "./facilities/types.ts";
export { requiredCapability, CAP, MIN_LEVEL_BY_TIER } from "./facilities/capability.ts";
export {
  assessFreshness,
  decayConfidence,
  agePhrase,
  DEFAULT_FRESHNESS,
} from "./facilities/freshness.ts";
export { rankFacilities, buildReasons, DEFAULT_RANKING } from "./facilities/rank.ts";

// --- sync ---
export type {
  SyncOpType,
  SyncOperation,
  SyncOpStatus,
  SyncOpResult,
  Hasher,
} from "./sync/types.ts";
export { canonicalize, payloadFingerprint, isUuidV4 } from "./sync/opId.ts";

// --- util ---
export type { Clock } from "./util/clock.ts";
export { systemClock, fixedClock, daysBetween } from "./util/clock.ts";
export type { Result } from "./util/result.ts";
export { Ok, Err, isOk, assertNever, clamp } from "./util/result.ts";
