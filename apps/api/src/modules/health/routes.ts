/**
 * FILE: apps/api/src/modules/health/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.4
 * STATUS: STUB — implement the route
 * PHASE: 2
 *
 * GET /health — the first thing to make green, and the endpoint the demo opens
 * with.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function healthRoutes(app: FastifyInstance) {
 *     app.get("/health", async () => {
 *       const dbUp = await healthCheck();            // never throws
 *       const body: HealthResponse = {
 *         status: dbUp ? "ok" : "degraded",
 *         version: APP_VERSION,
 *         database: dbUp ? "up" : "down",
 *         ragEnabled: config.RAG_ENABLED,
 *         time: new Date().toISOString(),
 *       };
 *       return { ok: true, data: body };
 *     });
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN NOTES
 *
 *   Returns HTTP 200 even when the database is down, with status "degraded".
 *   A 503 makes most orchestrators kill the container, and a restart loop hides
 *   the actual message ("password authentication failed") behind a wall of
 *   startup logs. Up-and-honest beats down-and-silent.
 *
 *   `ragEnabled` is here for one reason: the mobile app reads it and hides the
 *   guidance entry point when false. That is what keeps the demo honest about
 *   what is built — see README.md's implemented-vs-planned table.
 *
 *   No auth. No rate limit worth configuring. Do not add a version of this that
 *   dumps env vars or connection strings "for debugging".
 */

import type { FastifyInstance } from "fastify";
import { APP_VERSION, config } from "../../config.ts";
import { healthCheck } from "../../db/pool.ts";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    const dbUp = await healthCheck();
    return {
      ok: true,
      data: {
        status: dbUp ? "ok" : "degraded",
        version: APP_VERSION,
        database: dbUp ? "up" : "down",
        ragEnabled: false,
        time: new Date().toISOString(),
      },
    };
  });
}
