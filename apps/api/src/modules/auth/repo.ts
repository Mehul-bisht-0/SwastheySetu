/**
 * FILE: apps/api/src/modules/auth/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.5
 * STATUS: STUB — implement the queries
 * PHASE: 3
 *
 * SQL ONLY. No hashing, no token signing, no `if` on business rules — those
 * live in service.ts. A repo function maps arguments to a query and rows to a
 * row type, and does nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export interface UserRow {
 *        user_id, phone, full_name, role, password_hash, district_code, is_active
 *      }
 *      snake_case, matching the columns exactly. Mapping to camelCase happens in
 *      service.ts, so a column rename breaks in one obvious place.
 *
 *   2. export async function findByPhone(phone: string): Promise<UserRow | null>
 *        SELECT user_id, phone, full_name, role, password_hash, district_code, is_active
 *          FROM users WHERE phone = $1
 *      Return rows[0] ?? null.
 *      DO NOT add `AND is_active = true`. The service needs to tell "no such
 *      user" from "deactivated user" for logging; it still returns the same
 *      message to the client either way.
 *
 *   3. export async function upsertDevice(
 *        deviceId: string, userId: string, platform: string, appVersion: string
 *      ): Promise<void>
 *        INSERT INTO devices (device_id, user_id, platform, app_version, last_seen_at)
 *        VALUES ($1,$2,$3,$4, now())
 *        ON CONFLICT (device_id) DO UPDATE
 *          SET user_id = EXCLUDED.user_id,
 *              app_version = EXCLUDED.app_version,
 *              last_seen_at = now()
 *      Upsert, because a shared field phone gets handed between workers and the
 *      device row must follow the current user rather than error.
 *
 *   4. export async function findById(userId: string): Promise<UserRow | null>
 *      Backs GET /auth/me.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Every value is a $1 placeholder. No template literals in SQL, ever.
 */

import { query } from "../../db/pool.ts";

export interface UserRow {
  user_id: string;
  phone: string;
  full_name: string;
  role: string;
  password_hash: string;
  district_code: string;
  is_active: boolean;
}

export async function findByPhone(phone: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    "SELECT user_id, phone, full_name, role, password_hash, district_code, is_active FROM users WHERE phone = $1",
    [phone],
  );
  return rows[0] ?? null;
}

export async function findById(userId: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    "SELECT user_id, phone, full_name, role, password_hash, district_code, is_active FROM users WHERE user_id = $1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function upsertDevice(
  deviceId: string,
  userId: string,
  platform: string,
  appVersion: string,
): Promise<void> {
  await query(
    `INSERT INTO devices (device_id, user_id, platform, app_version, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (device_id) DO UPDATE
       SET user_id      = EXCLUDED.user_id,
           app_version  = EXCLUDED.app_version,
           last_seen_at = now()`,
    [deviceId, userId, platform, appVersion],
  );
}
