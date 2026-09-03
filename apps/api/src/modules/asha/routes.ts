/**
 * FILE: apps/api/src/modules/asha/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.9
 * STATUS: STUB — implement the three routes
 * PHASE: 8
 *
 * Registered by app.ts with prefix "/asha". EVERY route here is authenticated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT — all three take  onRequest: [requireAuth, requireRole("ASHA","SUPERVISOR","ADMIN")]
 *
 *   GET /asha/villages
 *     return { ok: true, data: await myVillages(req.user.district) };
 *
 *     District comes from THE TOKEN, never from a query parameter. A
 *     ?districtCode= would let any authenticated worker enumerate the country's
 *     village list.
 *
 *   POST /asha/visits
 *     const input = upsertVisitRequest.parse(req.body);
 *     const data  = await saveVisit(input, req.user.sub);
 *     reply.code(data.created ? 201 : 200);
 *     return { ok: true, data };
 *
 *     Upsert on visitId, so this is also the endpoint sync/push calls for
 *     HOUSEHOLD_VISIT_UPSERT. One code path, one set of bugs.
 *
 *   GET /asha/visits
 *     const q = listVisitsQuery.parse(req.query);
 *     return { ok: true, data: await visits(req.user.sub, q) };
 *
 *     ashaId from the token again. There is no way to ask for someone else's.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OFFLINE PATH DOES NOT GO THROUGH HERE
 *   In the field the app writes to local SQLite and queues a
 *   HOUSEHOLD_VISIT_UPSERT operation. These endpoints are the online
 *   convenience path and the target sync/push delegates to. If the two ever
 *   disagree about validation, the queued write is the one that breaks — days
 *   later, in a batch, with no user watching. Keep them on the same service
 *   function.
 */

import type { FastifyInstance } from "fastify";
import { asha as ashaContracts } from "@swasthyasetu/contracts";

import { myVillages, saveVisit, visits } from "./service.ts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";

export async function ashaRoutes(_app: FastifyInstance): Promise<void> {
  // Phase 8 — routes registered in a later phase
}
