/**
 * FILE: apps/api/src/modules/sync/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10
 * STATUS: STUB — implement the two routes
 * PHASE: 9
 *
 * Registered by app.ts with prefix "/sync". Both routes are authenticated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   POST /sync/push
 *     onRequest: [requireAuth]
 *     config: { rateLimit: { max: 600, timeWindow: "1 minute" } }
 *
 *       LOOSER than the global limit, deliberately. A device back from a week
 *       offline legitimately sends many batches in a burst. Throttling it drops
 *       field data — the single worst outcome in this system — so the limit is
 *       set to catch a runaway loop, not to shape traffic.
 *
 *     handler:
 *       const input = pushRequest.parse(req.body);
 *       const data  = await push(input, req.user.sub);
 *       return { ok: true, data };
 *
 *     ALWAYS HTTP 200, even when every operation was REJECTED. The transport
 *     succeeded; the per-operation outcomes are in the body. A 4xx here would
 *     make the client retry the whole batch including the operations that were
 *     permanently invalid, forever.
 *
 *   GET /sync/pull
 *     onRequest: [requireAuth]
 *     handler:
 *       const q = pullQuery.parse(req.query);
 *       return { ok: true, data: await pull(q, req.user.district) };
 *
 *     District from the token. Never from the query string.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TEST THAT MATTERS (apps/api/test/sync.test.ts)
 *   Push the same batch twice. First response: all APPLIED. Second response:
 *   all DUPLICATE, same serverIds, and the row counts in triage_reports,
 *   household_visits and facility_activity are UNCHANGED.
 *
 *   If that test passes, offline sync works. If it does not, an ASHA's day of
 *   work is duplicated or lost, and no amount of UI polish compensates.
 */

import type { FastifyInstance } from "fastify";
import { sync as syncContracts } from "@swasthyasetu/contracts";

import { pull, pushBatch } from "./service.ts";
import { requireAuth } from "../../plugins/auth.ts";

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post("/push", { onRequest: [requireAuth], config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req) => ({
    ok: true, data: await pushBatch(req.body, req.user.sub, req.user.did),
  }));
  app.get("/pull", { onRequest: [requireAuth] }, async (req) => ({
    ok: true, data: await pull(syncContracts.pullQuery.parse(req.query), req.user.district),
  }));
}
