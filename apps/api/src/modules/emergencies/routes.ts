import type { FastifyInstance } from "fastify";
import { common, patients as patientContracts } from "@swasthyasetu/contracts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";
import {
  activeEmergency, cancelEmergency, createEmergency, dispatchQueue, setDispatchStatus,
} from "./service.ts";

export async function emergencyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", {
    onRequest: [requireAuth, requireRole("PATIENT")],
    config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
  }, async (req, reply) => {
    const input = patientContracts.createEmergencyRequest.parse(req.body);
    const data = await createEmergency(req.user.sub, input);
    reply.code(201);
    return { ok: true, data };
  });

  app.get("/active", { onRequest: [requireAuth, requireRole("PATIENT")] }, async (req) => ({
    ok: true,
    data: await activeEmergency(req.user.sub),
  }));

  app.post("/:emergencyId/cancel", { onRequest: [requireAuth, requireRole("PATIENT")] }, async (req) => {
    const emergencyId = common.uuid.parse((req.params as Record<string, unknown>)["emergencyId"]);
    await cancelEmergency(emergencyId, req.user.sub);
    return { ok: true, data: { cancelled: true } };
  });

  app.get("/dispatch-queue", {
    onRequest: [requireAuth, requireRole("SUPERVISOR", "ADMIN")],
  }, async (req) => ({ ok: true, data: await dispatchQueue(req.user.district) }));

  app.post("/:emergencyId/status", {
    onRequest: [requireAuth, requireRole("SUPERVISOR", "ADMIN")],
  }, async (req) => {
    const emergencyId = common.uuid.parse((req.params as Record<string, unknown>)["emergencyId"]);
    const input = patientContracts.dispatcherStatusRequest.parse(req.body);
    return { ok: true, data: await setDispatchStatus(emergencyId, req.user.district, req.user.sub, input) };
  });
}
