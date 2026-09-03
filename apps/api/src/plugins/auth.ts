/**
 * FILE: apps/api/src/plugins/auth.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.3
 * STATUS: STUB — implement the plugin and guards
 * PHASE: 3
 *
 * JWT verification for ASHA/supervisor routes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE CITIZEN ROUTES ARE PUBLIC AND MUST STAY PUBLIC.
 *  POST /triage/evaluate, POST /facilities/recommend, GET /facilities/nearby
 *  and GET /health take NO auth. Do not "tidy up" by adding a global
 *  onRequest hook — a login screen between a frightened parent and an urgency
 *  answer defeats the product.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MAY IMPORT   fastify, @fastify/jwt, @swasthyasetu/contracts, ../config.ts, ./errors.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. Module augmentation so `req.user` is typed, not `any`:
 *        declare module "@fastify/jwt" {
 *          interface FastifyJWT { payload: JwtClaims; user: JwtClaims; }
 *        }
 *
 *   2. export async function registerAuth(app: FastifyInstance)
 *        await app.register(jwt, {
 *          secret: config.JWT_SECRET,
 *          sign: { expiresIn: config.JWT_EXPIRES_IN },
 *        });
 *
 *   3. export async function requireAuth(req, reply)
 *      Use as a per-route hook: { onRequest: [requireAuth] }
 *        try { await req.jwtVerify(); }
 *        catch { throw unauthorized("Sign in again."); }
 *      Swallow the library's message deliberately — "jwt expired" vs "invalid
 *      signature" tells an attacker which half of the token to work on, and
 *      tells the ASHA nothing useful either way.
 *
 *   4. export function requireRole(...roles: UserRole[])
 *      Returns a hook that runs AFTER requireAuth and throws forbidden() when
 *      req.user.role is not in `roles`. Order matters: an unauthenticated
 *      request must get 401, not 403.
 *
 *   5. export function signToken(app, claims): string
 *        app.jwt.sign({ sub, role, district, did })
 *      Only auth/service.ts calls this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISTRICT SCOPING — DO NOT SKIP
 *   `req.user.district` is not decoration. Every ASHA query is filtered by it in
 *   the repo layer, so one district's health worker cannot page through another
 *   district's household visits. Enforce it in SQL (`AND district_code = $n`),
 *   not by filtering in JavaScript after the rows have already left the database.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fjwt from "@fastify/jwt";
import type { auth as authContracts } from "@swasthyasetu/contracts";
import { config } from "../config.ts";
import { unauthorized, forbidden } from "./errors.ts";

type JwtClaims = ReturnType<typeof authContracts.jwtClaims.parse>;
type UserRole = ReturnType<typeof authContracts.userRole.parse>;

// Module augmentation so req.user is typed
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtClaims;
    user: JwtClaims;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized("Sign in again.");
  }
}

export function requireRole(...roles: UserRole[]) {
  return async function roleGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    // requireAuth must run first — if it didn't, req.user is undefined
    if (!req.user) throw unauthorized("Sign in again.");
    if (!roles.includes(req.user.role as UserRole)) {
      throw forbidden("Your account does not have permission for this action.");
    }
  };
}

export function signToken(app: FastifyInstance, claims: Omit<JwtClaims, "iat" | "exp">): string {
  // jwt.sign adds iat/exp from the `expiresIn` option — cast to satisfy strict types
  return app.jwt.sign(claims as JwtClaims);
}
