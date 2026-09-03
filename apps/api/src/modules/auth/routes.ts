/**
 * FILE: apps/api/src/modules/auth/routes.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.5
 * STATUS: STUB — implement the two routes
 * PHASE: 3
 *
 * HTTP ONLY: parse, delegate, wrap. A route handler in this codebase is three
 * lines. If yours has an `if` in it, that `if` belongs in service.ts.
 *
 * Registered by app.ts with prefix "/auth".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   POST /auth/login
 *     config: { rateLimit: { max: 10, timeWindow: "15 minutes" } }
 *       Tighter than the global limit: this is the one endpoint where guessing
 *       is the attack. 10 tries per quarter hour is generous for a person and
 *       useless for a script.
 *     handler:
 *       const input = loginRequest.parse(req.body);   // ZodError -> 400, handled
 *                                                     // centrally in plugins/errors.ts
 *       const data = await login(app, input);
 *       return { ok: true, data };
 *
 *   GET /auth/me
 *     onRequest: [requireAuth]
 *     handler:
 *       const data = await me(req.user.sub);
 *       return { ok: true, data };
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT IN v1, AND EACH FOR A REASON
 *
 *   POST /auth/register — an ASHA is appointed by the health system, not
 *     self-registered. A public signup on a health worker API is an open door.
 *   POST /auth/refresh — tokens last 30 days precisely so a worker offline for
 *     a fortnight is not locked out. A refresh endpoint implies short tokens,
 *     which is the opposite of what this deployment needs.
 *   POST /auth/logout — nothing to invalidate server-side. The client deletes
 *     the token. Revocation is `UPDATE users SET is_active = false`.
 */

import type { FastifyInstance } from "fastify";
import { auth as authContracts } from "@swasthyasetu/contracts";

import { login, me } from "./service.ts";
import { requireAuth } from "../../plugins/auth.ts";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, async (req) => {
    const input = authContracts.loginRequest.parse(req.body);
    const data = await login(app, input);
    return { ok: true, data };
  });

  app.get("/me", { onRequest: [requireAuth] }, async (req) => {
    const data = await me(req.user.sub);
    return { ok: true, data };
  });
}
