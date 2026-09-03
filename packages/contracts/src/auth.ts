/**
 * FILE: packages/contracts/src/auth.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.2
 * STATUS: COMPLETE — do not modify
 *
 * ASHA / supervisor authentication only.
 *
 * THE CITIZEN FLOW HAS NO LOGIN AND MUST NOT GAIN ONE.
 * A worried parent at 2am should not meet a signup form before they can find
 * out whether their child needs a hospital. Anonymity is also the privacy
 * control: there is no citizen account to breach.
 */

import { z } from "zod";
import { deviceId, districtCode, isoDateTime, uuid } from "./common.ts";

export const userRole = z.enum(["ASHA", "SUPERVISOR", "ADMIN"]);
export type UserRole = z.infer<typeof userRole>;

/** Indian mobile number, normalised to +91XXXXXXXXXX before it reaches the DB. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+91[6-9]\d{9}$/, "expected +91 followed by a 10-digit mobile number");

export const loginRequest = z.object({
  phone,
  /**
   * Minimum 8, no maximum below 128: bcrypt silently truncates at 72 bytes, so
   * the service layer must reject anything longer rather than accept a password
   * whose tail is ignored.
   */
  password: z.string().min(8).max(128),
  deviceId,
  platform: z.enum(["android", "ios", "unknown"]).default("unknown"),
  appVersion: z.string().max(32).default("0.0.0"),
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const sessionUser = z.object({
  userId: uuid,
  fullName: z.string(),
  role: userRole,
  districtCode,
});
export type SessionUser = z.infer<typeof sessionUser>;

export const loginResponse = z.object({
  /**
   * Long-lived on purpose (30 days, see plan §8.2). An ASHA may be offline for
   * a fortnight; a 1-hour token would lock her out of her own queued work.
   * The trade-off is accepted and recorded — revocation is by is_active = false.
   */
  accessToken: z.string(),
  expiresAt: isoDateTime,
  user: sessionUser,
});
export type LoginResponse = z.infer<typeof loginResponse>;

/** GET /auth/me — used on app start to decide whether the cached session is still valid. */
export const meResponse = sessionUser;
export type MeResponse = z.infer<typeof meResponse>;

/**
 * JWT claims. Kept small: a token is replayed on every sync request over a
 * 2G link, and every extra claim is bytes an ASHA pays for.
 */
export const jwtClaims = z.object({
  sub: uuid,
  role: userRole,
  district: districtCode,
  did: deviceId,
  iat: z.number().int(),
  exp: z.number().int(),
});
export type JwtClaims = z.infer<typeof jwtClaims>;
