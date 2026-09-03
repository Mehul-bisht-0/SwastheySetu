/**
 * FILE: packages/core/src/triage/predicate.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.2
 * STATUS: STUB — implement evalPredicate
 * PHASE: 1
 *
 * PURPOSE
 *   Red-flag rules are DATA, not code: a serialisable declarative AST. That buys
 *   three things. A clinician can review rules without reading TypeScript; rules
 *   can later ship to devices as a versioned data pack without an app release;
 *   and the evaluator itself is small enough to test exhaustively.
 *
 * MAY IMPORT
 *   ./types.ts, ../util/result.ts
 * MUST NOT IMPORT
 *   anything else — no npm packages, no node:* builtins
 *
 * DONE WHEN
 *   node --test "packages/core/src/triage/predicate.test.ts"  passes
 */

import type { AnswerValue, Encounter, SymptomCode } from "./types.ts";
import { assertNever } from "../util/result.ts";

/**
 * The rule AST.
 *
 * Note `mayBePregnant` — it encodes a SAFETY CONVENTION, not a fact:
 * an unknown pregnancy status in a woman of reproductive age is treated as
 * possibly pregnant, because the cost of missing an obstetric emergency is far
 * higher than the cost of an unnecessary referral.
 */
export type Predicate =
  | { op: "hasSymptom"; code: SymptomCode }
  | { op: "hasAnySymptom"; codes: SymptomCode[] }
  | { op: "ageMonthsLt"; value: number }
  | { op: "ageMonthsGte"; value: number }
  | { op: "isPregnant" }
  | { op: "mayBePregnant" }
  | { op: "answerEquals"; questionId: string; value: AnswerValue }
  | { op: "answerGte"; questionId: string; value: number }
  | { op: "answerMissing"; questionId: string }
  | { op: "all"; of: readonly Predicate[] }
  | { op: "any"; of: readonly Predicate[] }
  | { op: "not"; of: Predicate };

/** Lower bound of assumed reproductive age, in months (12 years). */
export const REPRODUCTIVE_AGE_MIN_MONTHS = 144;
/** Upper bound of assumed reproductive age, in months (50 years). */
export const REPRODUCTIVE_AGE_MAX_MONTHS = 600;

/**
 * True when pregnancy must be considered possible.
 *
 * IMPLEMENT
 *   return true if patient.pregnancy === "yes"
 *   OR (pregnancy === "unknown"
 *       AND sex === "female"
 *       AND ageMonths >= REPRODUCTIVE_AGE_MIN_MONTHS
 *       AND ageMonths <= REPRODUCTIVE_AGE_MAX_MONTHS)
 *   otherwise false.
 *
 * GUARDRAIL
 *   "unknown" must NEVER downgrade urgency. Do not simplify this to
 *   `pregnancy === "yes"` — that silently drops obstetric red flags for every
 *   woman who did not answer the question.
 */
export function mayBePregnant(e: Encounter): boolean {
  if (e.patient.pregnancy === "yes") return true;
  return (
    e.patient.pregnancy === "unknown" &&
    e.patient.sex === "female" &&
    e.patient.ageMonths >= REPRODUCTIVE_AGE_MIN_MONTHS &&
    e.patient.ageMonths <= REPRODUCTIVE_AGE_MAX_MONTHS
  );
}

/**
 * Evaluate a predicate against an encounter.
 *
 * IMPLEMENT — one exhaustive switch on p.op:
 *   hasSymptom      e.symptoms.includes(p.code)
 *   hasAnySymptom   p.codes.some(c => e.symptoms.includes(c))
 *   ageMonthsLt     e.patient.ageMonths <  p.value
 *   ageMonthsGte    e.patient.ageMonths >= p.value
 *   isPregnant      e.patient.pregnancy === "yes"
 *   mayBePregnant   mayBePregnant(e)
 *   answerEquals    e.answers[p.questionId] === p.value      (strict equality)
 *   answerGte       typeof v === "number" && v >= p.value    (a non-number is NOT a match)
 *   answerMissing   e.answers[p.questionId] === undefined || === null
 *   all             p.of.every(sub => evalPredicate(sub, e))    (empty array => true)
 *   any             p.of.some(sub  => evalPredicate(sub, e))    (empty array => false)
 *   not             !evalPredicate(p.of, e)
 *   default         assertNever(p, "evalPredicate")
 *
 * Keep `assertNever` in the default branch: adding a new op to the union then
 * becomes a COMPILE error rather than a rule that silently never fires.
 */
export function evalPredicate(p: Predicate, e: Encounter): boolean {
  switch (p.op) {
    case "hasSymptom":
      return e.symptoms.includes(p.code);
    case "hasAnySymptom":
      return p.codes.some((c) => e.symptoms.includes(c));
    case "ageMonthsLt":
      return e.patient.ageMonths < p.value;
    case "ageMonthsGte":
      return e.patient.ageMonths >= p.value;
    case "isPregnant":
      return e.patient.pregnancy === "yes";
    case "mayBePregnant":
      return mayBePregnant(e);
    case "answerEquals": {
      const v = e.answers[p.questionId];
      return v !== undefined && v !== null && v === p.value;
    }
    case "answerGte": {
      const v = e.answers[p.questionId];
      return typeof v === "number" && v >= p.value;
    }
    case "answerMissing": {
      const v = e.answers[p.questionId];
      return v === undefined || v === null;
    }
    case "all":
      return p.of.every((sub) => evalPredicate(sub, e));
    case "any":
      return p.of.some((sub) => evalPredicate(sub, e));
    case "not":
      return !evalPredicate(p.of, e);
    default:
      return assertNever(p, "evalPredicate");
  }
}
