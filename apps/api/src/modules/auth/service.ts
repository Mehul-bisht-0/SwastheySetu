/**
 * FILE: apps/api/src/modules/auth/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.5
 * STATUS: STUB — implement login and me
 * PHASE: 3
 *
 * MAY IMPORT   ./repo.ts, ../../util/hash.ts, ../../plugins/{auth,errors}.ts
 * MUST NOT IMPORT  fastify request/reply types (this layer knows nothing about HTTP)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function login(app: FastifyInstance, input: LoginRequest): Promise<LoginResponse>
 *
 *     1. const user = await findByPhone(input.phone)
 *     2. const ok = user ? await verifyPassword(input.password, user.password_hash) : false
 *
 *        RUN THE COMPARISON EVEN WHEN THE USER DOES NOT EXIST. Returning early
 *        on a missing user makes that path measurably faster, which turns login
 *        into a phone-number enumeration oracle. Either hash against a dummy
 *        bcrypt string, or accept the small cost and always call verify.
 *
 *     3. if (!ok || !user.is_active) throw unauthorized("Phone number or password is incorrect.")
 *
 *        ONE message for all three failures — no such user, wrong password,
 *        deactivated account. Log which it actually was (by user_id, never by
 *        phone); tell the client nothing.
 *
 *     4. await upsertDevice(input.deviceId, user.user_id, input.platform, input.appVersion)
 *     5. const token = signToken(app, {
 *          sub: user.user_id, role: user.role, district: user.district_code, did: input.deviceId,
 *        })
 *     6. Return { accessToken, expiresAt, user: { userId, fullName, role, districtCode } }
 *
 *        MAP THE FIELDS EXPLICITLY. Never `...user` — password_hash is on that
 *        object and a spread would put it on the wire.
 *
 *   export async function me(userId: string): Promise<SessionUser>
 *     findById, throw unauthorized() if missing or inactive, map the four public
 *     fields. Same rule: explicit mapping, no spread.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEEDING THE FIRST ASHA
 *   There is no signup endpoint — an ASHA is appointed, not self-registered.
 *   infra/seed/load.ts inserts the demo users. Their passwords live in
 *   .env.example as plain text, which is fine ONLY because the seeded accounts
 *   are demo accounts on demo data. Do not reuse that pattern for anything real,
 *   and do not add a public /auth/register.
 */

import type { FastifyInstance } from "fastify";
import type { auth as authContracts } from "@swasthyasetu/contracts";

import { findById, findByPhone, upsertDevice } from "./repo.ts";
import { verifyPassword } from "../../util/hash.ts";
import { signToken } from "../../plugins/auth.ts";
import { unauthorized } from "../../plugins/errors.ts";

type LoginRequest = ReturnType<typeof authContracts.loginRequest.parse>;
type LoginResponse = ReturnType<typeof authContracts.loginResponse.parse>;
type SessionUser = ReturnType<typeof authContracts.sessionUser.parse>;

// A dummy hash to compare against when the phone is not found — prevents
// the timing oracle that would let a caller enumerate valid phone numbers.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function login(
  app: FastifyInstance,
  input: LoginRequest,
): Promise<LoginResponse> {
  const user = await findByPhone(input.phone);
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(input.password, hashToCheck);

  if (!passwordOk || !user || !user.is_active) {
    app.log.warn(
      {
        userId: user?.user_id ?? "unknown",
        reason: !user ? "no_such_user" : !passwordOk ? "wrong_password" : "deactivated",
      },
      "login failed",
    );
    throw unauthorized("Phone number or password is incorrect.");
  }

  await upsertDevice(input.deviceId, user.user_id, input.platform, input.appVersion);

  const token = signToken(app, {
    sub: user.user_id,
    role: user.role as "ASHA" | "SUPERVISOR" | "ADMIN",
    district: user.district_code,
    did: input.deviceId,
  });

  // Decode exp from the signed token rather than re-computing it
  const decoded = app.jwt.decode<{ exp: number }>(token);
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    accessToken: token,
    expiresAt,
    user: {
      userId: user.user_id,
      fullName: user.full_name,
      role: user.role as LoginResponse["user"]["role"],
      districtCode: user.district_code,
    },
  };
}

export async function me(userId: string): Promise<SessionUser> {
  const user = await findById(userId);
  if (!user || !user.is_active) throw unauthorized("Session is no longer valid.");
  return {
    userId: user.user_id,
    fullName: user.full_name,
    role: user.role as SessionUser["role"],
    districtCode: user.district_code,
  };
}
