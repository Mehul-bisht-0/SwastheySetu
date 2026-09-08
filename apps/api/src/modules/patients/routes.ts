import type { FastifyInstance } from "fastify";
import { patients as patientContracts } from "@swasthyasetu/contracts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";
import {
  finishMockVerification, getPatientProfile, loginPatient, registerPatient, startVerification,
} from "./service.ts";

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const input = patientContracts.registerRequest.parse(req.body);
    const data = await registerPatient(app, input);
    reply.code(201);
    return { ok: true, data };
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => {
    const input = patientContracts.loginRequest.parse(req.body);
    return { ok: true, data: await loginPatient(app, input) };
  });

  app.get("/me", { onRequest: [requireAuth, requireRole("PATIENT")] }, async (req) => ({
    ok: true,
    data: await getPatientProfile(req.user.sub),
  }));

  app.post("/verification/sessions", {
    onRequest: [requireAuth, requireRole("PATIENT")],
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const input = patientContracts.startVerificationRequest.parse(req.body);
    const data = await startVerification(req.user.sub, input);
    reply.code(201);
    return { ok: true, data };
  });

  app.post("/verification/mock-complete", {
    onRequest: [requireAuth, requireRole("PATIENT")],
  }, async (req) => {
    const input = patientContracts.completeMockVerificationRequest.parse(req.body);
    return { ok: true, data: await finishMockVerification(req.user.sub, input.verificationSessionId) };
  });
}
