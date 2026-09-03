/**
 * FILE: apps/api/src/util/hash.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.3
 * STATUS: STUB — implement the three functions
 * PHASE: 3
 *
 * MAY IMPORT   node:crypto, bcryptjs, @swasthyasetu/core
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export const sha256: Hasher = (input) =>
 *        createHash("sha256").update(input, "utf8").digest("hex");
 *
 *      This is the `Hasher` that gets injected into core's payloadFingerprint().
 *      Core cannot import node:crypto — it runs on a phone — so the hash
 *      function is passed in. Same canonicalisation, same digest, both sides.
 *
 *   2. export async function hashPassword(plain: string): Promise<string>
 *        bcrypt with cost 10.
 *        REJECT anything longer than 72 BYTES first. bcrypt silently truncates
 *        there, so a 100-character passphrase would authenticate against its own
 *        first 72 bytes — the user believes they have a strong password and does
 *        not. Check Buffer.byteLength(plain, "utf8") > 72 and throw.
 *
 *   3. export async function verifyPassword(plain, hash): Promise<boolean>
 *        return bcrypt.compare(plain, hash)   // constant-time, do not hand-roll
 *
 *      Never compare with ===. Never log either argument.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY bcryptjs AND NOT bcrypt
 *   Pure JS, no native build step. Slower, which does not matter for a
 *   prototype with a handful of ASHA logins, and it means `npm install` cannot
 *   fail on a judge's laptop for want of a C++ toolchain 20 minutes before a
 *   demo.
 */

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Hasher } from "@swasthyasetu/core";

export const sha256: Hasher = (input: string): string => {
  return createHash("sha256").update(input, "utf8").digest("hex");
};

export async function hashPassword(plain: string): Promise<string> {
  if (Buffer.byteLength(plain, "utf8") > 72) {
    throw new Error("Password exceeds 72 bytes — bcrypt would silently truncate it.");
  }
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
