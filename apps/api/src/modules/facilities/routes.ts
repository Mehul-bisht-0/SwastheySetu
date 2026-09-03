/**
 * FILE: apps/api/src/modules/facilities/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.8
 * STATUS: STUB — implement the three routes
 * PHASE: 4–6
 *
 * Registered by app.ts with prefix "/facilities".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   GET /facilities/nearby                          ← PUBLIC
 *     const q = nearbyQuery.parse(req.query);
 *     return { ok: true, data: await listNearby(q) };
 *
 *     Note nearbyQuery uses z.coerce for the numbers: query strings arrive as
 *     strings and a plain z.number() would reject every request.
 *
 *   POST /facilities/recommend                      ← PUBLIC. The headline endpoint.
 *     const input = recommendRequest.parse(req.body);
 *     return { ok: true, data: await recommend(input) };
 *
 *     Public because it is the second half of the citizen flow: urgency, then
 *     where to go. Putting a login here would strand a user between the two.
 *
 *   POST /facilities/:facilityId/signals            ← AUTHED
 *     onRequest: [requireAuth, requireRole("ASHA", "SUPERVISOR", "ADMIN")]
 *     handler:
 *       const { facilityId } = z.object({ facilityId: uuid }).parse(req.params);
 *       const input = createSignalRequest.parse({ ...req.body, facilityId });
 *       const data = await submitSignal(input, req.user.sub);
 *       reply.code(data.created ? 201 : 200);
 *       return { ok: true, data };
 *
 *     TAKE facilityId FROM THE PATH, not the body, and overwrite whatever the
 *     body claimed. Otherwise a request to /facilities/A/signals carrying
 *     { facilityId: "B" } writes evidence against B while appearing to be about
 *     A — a confused-deputy bug that is invisible in the logs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ONLY AN ASHA MAY REPORT A SIGNAL
 *   Freshness is the input to ranking. If anyone could post FACILITY_CLOSED,
 *   anyone could steer patients away from a working hospital. Attribution to a
 *   named health worker (submitted_by) is the accountability that makes the
 *   evidence worth trusting at all.
 */

import type { FastifyInstance } from "fastify";
import { facilities as facilityContracts, common } from "@swasthyasetu/contracts";

import { listNearby, submitSignal } from "./service.ts";
import { recommend } from "../routing/service.ts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";

export async function facilitiesRoutes(app: FastifyInstance): Promise<void> {
  // GET /facilities/nearby — public
  app.get("/nearby", async (req) => {
    const q = facilityContracts.nearbyQuery.parse(req.query);
    return { ok: true, data: await listNearby(q) };
  });

  // POST /facilities/recommend — public (citizen flow)
  app.post("/recommend", async (req) => {
    const input = facilityContracts.recommendRequest.parse(req.body);
    return { ok: true, data: await recommend(input) };
  });

  // POST /facilities/:facilityId/signals — authenticated ASHA
  app.post("/:facilityId/signals", {
    onRequest: [requireAuth, requireRole("ASHA", "SUPERVISOR", "ADMIN")],
  }, async (req, reply) => {
    const { facilityId } = common.uuid.transform((v) => ({ facilityId: v })).parse(
      (req.params as Record<string, unknown>)["facilityId"],
    );
    const input = facilityContracts.createSignalRequest.parse({
      ...(req.body as object),
      facilityId,
    });
    const data = await submitSignal(input, req.user.sub);
    reply.code(data.created ? 201 : 200);
    return { ok: true, data };
  });
}
