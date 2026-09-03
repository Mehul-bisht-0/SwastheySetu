/**
 * FILE: packages/contracts/src/triage.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.3
 * STATUS: COMPLETE — do not modify
 *
 * The wire form of the decision engine.
 *
 * THESE SCHEMAS MUST STAY STRUCTURALLY IDENTICAL to the interfaces in
 * packages/core/src/triage/types.ts. The API parses a request with `encounter`,
 * hands the parsed object straight to `evaluateTriage`, and serialises the
 * `TriageResult` back with `triageResult`. There is no mapping layer, because a
 * mapping layer is a place for a field to get dropped.
 *
 * WHY THE SAME EVALUATION EXISTS ON BOTH SIDES
 *   The phone runs `evaluateTriage` locally so the answer appears with no
 *   network. The server runs the identical code on sync so the stored record is
 *   trustworthy and version-stamped. Same input, same code, same answer — that
 *   is the whole point of core being dependency-free.
 */

import { z } from "zod";
import { ageMonths, isoDateTime, pregnancy, sex, urgencyTier, uuid } from "./common.ts";

/** MIRRORS SymptomCode in packages/core/src/triage/types.ts — keep in the same order. */
export const symptomCode = z.enum([
  "FEVER",
  "COUGH",
  "FAST_BREATHING",
  "DIARRHOEA",
  "VOMITING",
  "CONVULSION",
  "UNCONSCIOUS",
  "NOT_FEEDING",
  "CHEST_PAIN",
  "BLEEDING_HEAVY",
  "SEVERE_ABDOMINAL_PAIN",
  "RASH",
  "INJURY",
  "SWELLING_FACE_HANDS",
  "BLURRED_VISION",
  "REDUCED_FETAL_MOVEMENT",
  "WEAKNESS_ONE_SIDE",
  "DIFFICULTY_SPEAKING",
  "BURNING_URINATION",
]);
export type SymptomCode = z.infer<typeof symptomCode>;

export const patientContext = z.object({
  ageMonths,
  sex,
  pregnancy,
});

/**
 * Answers are deliberately loose: string | number | boolean, unknown keys
 * allowed.
 *
 * WHY NOT A CLOSED SCHEMA
 *   The question set will grow during the hackathon. A closed schema would make
 *   an older phone's queued answer fail validation on a newer server — the
 *   offline write is then rejected and the ASHA's work is lost. `extractFeatures`
 *   already treats every unrecognised or wrongly-typed answer as 0, so loose
 *   parsing here is safe by construction, not by luck.
 */
export const answerValue = z.union([z.string(), z.number(), z.boolean()]);
export const answers = z.record(z.string(), answerValue).default({});

export const encounter = z.object({
  patient: patientContext,
  symptoms: z.array(symptomCode).max(20).default([]),
  answers,
});
export type Encounter = z.infer<typeof encounter>;

export const redFlagHit = z.object({
  ruleId: z.string(),
  label: z.string(),
  advice: z.array(z.string()),
});

export const classifierOutput = z.object({
  score: z.number(),
  features: z.record(z.string(), z.number()),
  version: z.string(),
});

export const triageResult = z.object({
  tier: urgencyTier,
  decisionSource: z.enum(["RED_FLAG", "CLASSIFIER"]),
  redFlagHits: z.array(redFlagHit),
  /** Absent when a red flag decided the outcome — the classifier never ran. */
  classifier: classifierOutput.optional(),
  rulesetVersion: z.string(),
  advice: z.array(z.string()),
  /** Never optional. A result without the non-diagnostic notice is a bug. */
  disclaimer: z.string().min(1),
  evaluatedAt: isoDateTime,
});
export type TriageResult = z.infer<typeof triageResult>;

// ------------------------------------------------------------ POST /triage/evaluate

/**
 * Stateless evaluation. Writes nothing, needs no auth, and is what the citizen
 * flow calls when it happens to be online. The offline path calls core directly
 * and skips this endpoint entirely — both must produce the same result.
 */
export const evaluateRequest = z.object({
  encounter,
  /** Optional: lets the server rank facilities in the same round trip. */
  villageId: uuid.optional(),
});
export type EvaluateRequest = z.infer<typeof evaluateRequest>;

export const evaluateResponse = z.object({
  result: triageResult,
});
export type EvaluateResponse = z.infer<typeof evaluateResponse>;

// ------------------------------------------------------------ POST /triage/reports

/**
 * Persist an evaluated encounter. Maps 1:1 onto triage_reports in
 * 007_triage.sql, including the stored feature vector.
 *
 * IDEMPOTENT: reportId is generated on the device. A retry after a dropped
 * response inserts ON CONFLICT DO NOTHING and returns the same 201 body.
 */
export const createReportRequest = z.object({
  reportId: uuid,
  deviceId: z.string().optional(),
  villageId: uuid.optional(),
  encounter,
  result: triageResult,
  /** True when the phone decided this with no network. Drives the offline-usage metric. */
  evaluatedOffline: z.boolean().default(false),
  /** Device clock at the time of evaluation. Advisory; the server stamps received_at itself. */
  createdAt: isoDateTime,
});
export type CreateReportRequest = z.infer<typeof createReportRequest>;

export const createReportResponse = z.object({
  reportId: uuid,
  /** false means this reportId already existed — the client should stop retrying. */
  created: z.boolean(),
});
export type CreateReportResponse = z.infer<typeof createReportResponse>;
