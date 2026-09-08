import type { FastifyInstance } from "fastify";
import { patients as patientContracts } from "@swasthyasetu/contracts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";
import { finishMockAbhaLink, getAbhaStatus, startAbhaLink } from "./service.ts";

export async function abhaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", { onRequest: [requireAuth, requireRole("PATIENT")] }, async (req) => ({
    ok: true, data: await getAbhaStatus(req.user.sub),
  }));

  app.post("/link-sessions", {
    onRequest: [requireAuth, requireRole("PATIENT")],
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const input = patientContracts.startAbhaLinkRequest.parse(req.body);
    const data = await startAbhaLink(req.user.sub, input);
    reply.code(201);
    return { ok: true, data };
  });

  app.post("/mock-complete", { onRequest: [requireAuth, requireRole("PATIENT")] }, async (req) => {
    const input = patientContracts.completeMockAbhaLinkRequest.parse(req.body);
    return { ok: true, data: await finishMockAbhaLink(req.user.sub, input) };
  });
}
