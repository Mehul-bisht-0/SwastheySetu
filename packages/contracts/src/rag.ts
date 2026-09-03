/**
 * FILE: packages/contracts/src/rag.ts
 * PLAN: IMPLEMENTATION_PLAN.md §13
 * STATUS: COMPLETE — do not modify
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SEAM, NOT THE FEATURE. DO NOT IMPLEMENT RAG IN v1.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file exists so the knowledge engine has a defined shape to arrive into.
 * The endpoint returns 501 NOT_IMPLEMENTED and the mobile app hides the entry
 * point when /health reports ragEnabled: false.
 *
 * WHY DEFINE IT NOW AND BUILD IT LATER
 *   Leaving a hole shaped like the answer keeps the third engine genuinely
 *   separate. If RAG were added later with no seam, the fastest path would be to
 *   call an LLM from inside the triage service — and then the LLM is the triage
 *   engine, which is the one thing this architecture exists to prevent.
 *
 * THREE RULES THE EVENTUAL IMPLEMENTATION MUST HONOUR
 *   1. It answers "what does approved guidance say?" — never "how urgent is
 *      this?" and never "which facility?". Those are the other two engines' jobs
 *      and they are already answered before this is ever called.
 *   2. Every answer carries citations. An uncited answer is not returned at all;
 *      `answer` is null and `citations` is empty. Silence beats an invented
 *      guideline.
 *   3. All LLM calls happen on the backend. No API key is ever shipped to the
 *      React Native bundle. scripts/check-no-secrets.mjs fails the build if one
 *      appears there.
 */

import { z } from "zod";
import { urgencyTier, uuid } from "./common.ts";

export const citation = z.object({
  documentId: uuid,
  title: z.string(),
  publisher: z.string(),
  versionLabel: z.string(),
  /** Page or section reference, shown verbatim next to the answer. */
  pageRef: z.string().nullable(),
  /** The exact retrieved text. Displayed, so a user can check the paraphrase. */
  snippet: z.string(),
});
export type Citation = z.infer<typeof citation>;

export const askRequest = z.object({
  question: z.string().min(3).max(500),
  language: z.enum(["en", "hi"]).default("en"),
  /**
   * Read-only context. It may shape the wording of an explanation; it must never
   * be re-scored, re-triaged, or contradicted. The tier is already decided.
   */
  context: z
    .object({
      tier: urgencyTier.optional(),
      ruleIds: z.array(z.string()).optional(),
    })
    .optional(),
});
export type AskRequest = z.infer<typeof askRequest>;

export const askResponse = z.object({
  /** Null when retrieval found nothing above threshold. Render "I don't know". */
  answer: z.string().nullable(),
  /** Empty iff answer is null. Enforced in the service, asserted in tests. */
  citations: z.array(citation),
  /** Repeated here so the disclaimer survives even if the client caches only this object. */
  disclaimer: z.string(),
});
export type AskResponse = z.infer<typeof askResponse>;

/**
 * The literal body POST /rag/ask returns in v1, with HTTP 501.
 *
 * Exported as a constant so the route handler, the API test and the demo script
 * all assert the same thing — and so nobody is tempted to make the endpoint
 * "temporarily" return a plausible-looking canned answer.
 */
export const RAG_NOT_IMPLEMENTED = {
  ok: false,
  error: {
    code: "NOT_IMPLEMENTED",
    message:
      "The guidance assistant is not part of this prototype. Triage and facility " +
      "recommendations do not depend on it.",
  },
} as const;
