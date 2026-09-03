/**
 * FILE: apps/api/src/modules/triage/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.6
 * STATUS: STUB — implement the two routes
 * PHASE: 3
 *
 * Registered by app.ts with prefix "/triage".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   POST /triage/evaluate        ← PUBLIC, NO AUTH. This is deliberate.
 *     const { encounter } = evaluateRequest.parse(req.body);
 *     return { ok: true, data: { result: evaluate(encounter) } };
 *
 *     Stateless: reads nothing, writes nothing, touches no database. It exists
 *     so an online client gets the same answer the offline one computes locally,
 *     and so the safety layer is demonstrable with a single curl command.
 *
 *   POST /triage/reports         ← PUBLIC TOO, and read the note below
 *     const input = createReportRequest.parse(req.body);
 *     const data = await createReport(input);
 *     reply.code(data.created ? 201 : 200);
 *     return { ok: true, data };
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY /triage/reports TAKES NO AUTH
 *
 *   The citizen flow is anonymous by design (see the header of
 *   packages/contracts/src/auth.ts). Requiring a token here would mean either
 *   putting a login in front of the citizen flow, or shipping a shared secret in
 *   the app bundle — which is not a secret.
 *
 *   The trade-off, stated plainly: anyone can POST junk reports. The mitigations
 *   are the global rate limit, that reportId is a client UUID so replays collapse
 *   to one row, and that the rows are anonymous and analytical rather than
 *   authoritative. Record this in docs/SAFETY.md rather than quietly bolting on
 *   auth and breaking the anonymity property.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DO NOT ADD
 *   GET /triage/reports/:id or any listing endpoint. Nothing in v1 needs to read
 *   an individual report back, and an unauthenticated read of stored symptom
 *   data would turn an anonymous write-only sink into a health-record leak.
 */

import type { FastifyInstance } from "fastify";
import { triage as triageContracts } from "@swasthyasetu/contracts";

import { createReport, evaluate } from "./service.ts";

export async function triageRoutes(app: FastifyInstance): Promise<void> {
  // POST /triage/evaluate — stateless, public, no auth
  app.post("/evaluate", async (req) => {
    const { encounter } = triageContracts.evaluateRequest.parse(req.body);
    return { ok: true, data: { result: evaluate(encounter) } };
  });

  // POST /triage/reports — public (anonymous citizen flow)
  app.post("/reports", async (req, reply) => {
    const input = triageContracts.createReportRequest.parse(req.body);
    const data = await createReport(input);
    reply.code(data.created ? 201 : 200);
    return { ok: true, data };
  });
}
