/**
 * FILE: apps/api/src/app.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.1
 * STATUS: STUB — implement buildApp
 * PHASE: 2
 *
 * Builds the Fastify instance WITHOUT listening. server.ts starts it; tests
 * import it and use `app.inject()`, which needs no port and no network — that
 * is why building and listening are separated.
 *
 * MAY IMPORT   fastify, @fastify/cors, @fastify/rate-limit, ./config.ts,
 *              ./plugins/*.ts, ./modules/**\/routes.ts
 * MUST NOT IMPORT  any repo.ts (routes reach repos through services, never directly)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT — registration order matters, follow it exactly
 *
 *   export async function buildApp(): Promise<FastifyInstance>
 *
 *   1. const app = Fastify({ logger: loggerOptions(), genReqId, trustProxy: true })
 *   2. registerObservability(app)      // request ids exist before anything can log
 *   3. registerErrorHandler(app)       // installed early so a plugin that fails
 *                                      // to register is still reported in the
 *                                      // standard envelope
 *   4. await app.register(cors, {
 *        origin: config.CORS_ORIGINS === "*" ? true : config.CORS_ORIGINS.split(","),
 *      })
 *   5. await app.register(rateLimit, { max: 120, timeWindow: "1 minute" })
 *      Then OVERRIDE it per route:
 *        POST /auth/login  -> max 10 / 15 minutes  (credential stuffing)
 *        POST /sync/push   -> max 600 / 1 minute   (a device back from a week
 *                             offline legitimately sends many batches; throttling
 *                             it loses field data, which is the worst outcome here)
 *   6. await registerAuth(app)
 *   7. Register route modules under their prefixes:
 *        healthRoutes                        (no prefix — GET /health)
 *        authRoutes,       prefix "/auth"
 *        triageRoutes,     prefix "/triage"
 *        facilitiesRoutes, prefix "/facilities"
 *        ashaRoutes,       prefix "/asha"
 *        syncRoutes,       prefix "/sync"
 *        ragRoutes,        prefix "/rag"
 *   8. return app
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO GLOBAL AUTH HOOK
 *   Public: GET /health, POST /triage/evaluate, POST /facilities/recommend,
 *           GET /facilities/nearby, POST /rag/ask (501)
 *   Authed: everything under /auth/me, /asha, /sync, and POST /facilities/:id/signals
 *
 *   Auth is opted into per route with { onRequest: [requireAuth] }. A global hook
 *   with an exemption list is one forgotten entry away from putting a login in
 *   front of the citizen triage flow.
 */

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { config } from "./config.ts";
import { registerErrorHandler } from "./plugins/errors.ts";
import { loggerOptions, registerObservability } from "./plugins/observability.ts";
import { registerAuth } from "./plugins/auth.ts";

import { healthRoutes } from "./modules/health/routes.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { triageRoutes } from "./modules/triage/routes.ts";
import { facilitiesRoutes } from "./modules/facilities/routes.ts";
import { ashaRoutes } from "./modules/asha/routes.ts";
import { syncRoutes } from "./modules/sync/routes.ts";
import { ragRoutes } from "./modules/rag/routes.ts";
import { assignmentRoutes } from "./modules/assignments/routes.ts";
import { ivrRoutes } from "./modules/ivr/routes.ts";
import { patientRoutes } from "./modules/patients/routes.ts";
import { emergencyRoutes } from "./modules/emergencies/routes.ts";
import { abhaRoutes } from "./modules/abha/routes.ts";
import { registerProviderAuth } from "./plugins/providerAuth.ts";
import { providerAuthRoutes } from "./modules/provider-auth/routes.ts";
import { mockAbdmRoutes } from "./modules/mock-abdm/routes.ts";
import { providerRecordRoutes } from "./modules/provider-records/routes.ts";
import { referralRoutes } from "./modules/referrals/routes.ts";
import { diagnosticRoutes,providerDiagnosticOrderRoutes,providerDiagnosticServiceRoutes,patientDiagnosticRoutes } from "./modules/diagnostics/routes.ts";
import { providerConnectivityRoutes,patientConnectivityRoutes } from "./modules/connectivity/routes.ts";
import { diagnosticIvrRoutes } from "./modules/diagnostic-ivr/routes.ts";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    trustProxy: false,
    disableRequestLogging: true, // we log in onResponse hook instead
  });

  // 1. Observability first — request ids must exist before anything logs
  registerObservability(app);

  // 2. Error handler installed early so plugin-registration failures are formatted
  registerErrorHandler(app);

  // 3. CORS
  await app.register(cors, {
    origin: config.CORS_ORIGINS === "*" ? true : config.CORS_ORIGINS.split(","),
  });

  // 4. Global rate limit — per-route overrides tighten or loosen this
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  // 5. JWT auth plugin
  await registerAuth(app);
  registerProviderAuth(app);

  // 6. Routes
  await app.register(healthRoutes);                      // GET /health
  await app.register(authRoutes,       { prefix: "/auth" });
  await app.register(triageRoutes,     { prefix: "/triage" });
  await app.register(facilitiesRoutes, { prefix: "/facilities" });
  await app.register(ashaRoutes,       { prefix: "/asha" });
  await app.register(syncRoutes,       { prefix: "/sync" });
  await app.register(ragRoutes,        { prefix: "/rag" });
  await app.register(assignmentRoutes, { prefix: "/assignments" });
  await app.register(ivrRoutes,        { prefix: "/ivr" });
  await app.register(patientRoutes,    { prefix: "/patients" });
  await app.register(emergencyRoutes,  { prefix: "/emergencies" });
  await app.register(abhaRoutes,       { prefix: "/patients/abha" });
  await app.register(providerAuthRoutes,{ prefix: "/provider/auth" });
  await app.register(providerRecordRoutes,{ prefix: "/provider" });
  await app.register(mockAbdmRoutes,   { prefix: "/mock-abdm" });
  await app.register(referralRoutes,   { prefix: "/referrals" });
  await app.register(diagnosticRoutes,{prefix:"/diagnostics"});
  await app.register(providerDiagnosticServiceRoutes,{prefix:"/provider/diagnostic-services"});
  await app.register(providerDiagnosticOrderRoutes,{prefix:"/provider/diagnostic-orders"});
  await app.register(patientDiagnosticRoutes,{prefix:"/patients/diagnostics"});
  await app.register(providerConnectivityRoutes,{prefix:"/provider/sync"});
  await app.register(patientConnectivityRoutes,{prefix:"/patients/sync"});
  await app.register(diagnosticIvrRoutes,{prefix:"/ivr/diagnostics"});

  return app;
}
