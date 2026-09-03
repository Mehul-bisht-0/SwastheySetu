/**
 * FILE: apps/api/src/modules/rag/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §13
 * STATUS: STUB — implement the 501 route (and nothing else)
 * PHASE: 10
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  DO NOT IMPLEMENT RAG IN v1.
 *
 *  This route returns 501 with the constant body from
 *  packages/contracts/src/rag.ts. That is the entire file. There is no service,
 *  no repo, no embedding client, no prompt, and no LLM SDK in package.json.
 *
 *  The user has said the RAG specification will be supplied separately. Until
 *  it arrives, the honest thing — and the thing that keeps the three engines
 *  separate — is a defined hole rather than a plausible guess.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function ragRoutes(app: FastifyInstance) {
 *     app.post("/ask", async (req, reply) => {
 *       // Parse anyway: a 400 for a malformed body is more useful than a 501,
 *       // and it keeps the contract exercised so it cannot rot.
 *       askRequest.parse(req.body);
 *       reply.code(501);
 *       return RAG_NOT_IMPLEMENTED;
 *     });
 *   }
 *
 *   Registered by app.ts with prefix "/rag", so the path is POST /rag/ask.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHEN THE SPECIFICATION ARRIVES, THESE STAY TRUE
 *
 *   1. Retrieval and generation happen HERE, on the backend. No API key ever
 *      reaches the React Native bundle. scripts/check-no-secrets.mjs fails the
 *      build if one appears in apps/mobile.
 *
 *   2. This engine answers "what does approved guidance say?" — never "how
 *      urgent is this?" and never "which facility?". Both are already decided
 *      before it is called, by code that does not import an LLM.
 *
 *   3. No citations, no answer. `answer: null` and an empty `citations` array is
 *      a correct response. An invented guideline delivered confidently is worse
 *      than silence, because a user has no way to tell the difference.
 *
 *   4. A failure here degrades nothing. Triage and recommendations must keep
 *      working with the LLM provider entirely unreachable — which, on a rural
 *      connection, is the normal case rather than the exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY /health REPORTS ragEnabled: false
 *   The mobile app reads that flag and hides the guidance entry point entirely.
 *   No greyed-out button, no "coming soon" — the feature is simply absent. That
 *   is what stops the demo implying a capability the prototype does not have.
 */

import type { FastifyInstance } from "fastify";
import { rag as ragContracts } from "@swasthyasetu/contracts";

export async function ragRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ask", async (req, reply) => {
    // Parse anyway so a malformed body gets 400, not 501
    ragContracts.askRequest.parse(req.body);
    reply.code(501);
    return ragContracts.RAG_NOT_IMPLEMENTED;
  });
}
