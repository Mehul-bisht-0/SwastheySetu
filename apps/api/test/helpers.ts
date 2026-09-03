/**
 * FILE: apps/api/test/helpers.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9, §14.2
 * STATUS: STUB — implement the helpers
 * PHASE: 3
 *
 * Shared setup for API tests. Uses app.inject() — Fastify's in-process request
 * simulator — so tests need no port, no fetch and no running server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export async function testApp(): Promise<FastifyInstance>
 *        Set NODE_ENV=test before importing config, then buildApp().
 *        Cache the instance in a module-level variable: building it per test
 *        opens a new pool each time and exhausts Postgres connections after
 *        about ten tests.
 *
 *   2. export async function loginAs(app, phone, password): Promise<string>
 *        POST /auth/login via inject, return data.accessToken.
 *        Use the seeded demo ASHA from infra/seed/load.ts.
 *
 *   3. export function authHeader(token: string)
 *        => ({ authorization: `Bearer ${token}` })
 *
 *   4. export async function resetTables(): Promise<void>
 *        TRUNCATE sync_operations, facility_activity, household_visits,
 *                 triage_reports RESTART IDENTITY CASCADE;
 *
 *        TRUNCATE ONLY THOSE FOUR. Do not truncate facilities, villages,
 *        districts or travel_times — they are seeded reference data and
 *        re-seeding them per test makes the suite crawl.
 *
 *        GUARD IT:
 *          if (config.NODE_ENV !== "test") throw new Error("refusing to truncate");
 *        A helper that wipes tables must be unable to run against a database
 *        someone is demoing from.
 *
 *   5. export function body<T>(res: { payload: string }): T
 *        => JSON.parse(res.payload)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH TESTS NEED A DATABASE
 *
 *   NO DB:  /health (reports degraded), POST /triage/evaluate (pure function).
 *           Write these first — they run anywhere, including in CI with no
 *           services, and they catch wiring mistakes in app.ts immediately.
 *
 *   DB:     everything else. Skip them cleanly when the DB is unreachable
 *           rather than failing the suite:
 *             const dbUp = await healthCheck();
 *             test("...", { skip: !dbUp && "no database" }, async () => { ... });
 *           A red suite that means "Docker is not running" trains people to
 *           ignore red suites.
 */

import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { config } from "../src/config.ts";
import { healthCheck, pool } from "../src/db/pool.ts";

let _app: FastifyInstance | undefined;

export async function testApp(): Promise<FastifyInstance> {
  if (!_app) {
    process.env["NODE_ENV"] = "test";
    _app = await buildApp();
  }
  return _app;
}

export async function loginAs(
  app: FastifyInstance,
  phone: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { phone, password, deviceId: "test-device-id-00000001", platform: "unknown" },
  });
  const parsed = body<{ ok: boolean; data: { accessToken: string } }>(res);
  if (!parsed.ok) throw new Error(`loginAs failed: ${res.payload}`);
  return parsed.data.accessToken;
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export async function resetTables(): Promise<void> {
  if (config.NODE_ENV !== "test") throw new Error("refusing to truncate outside test env");
  await pool.query(
    "TRUNCATE sync_operations, facility_activity, household_visits, triage_reports RESTART IDENTITY CASCADE",
  );
}

export function body<T>(res: { payload: string }): T {
  return JSON.parse(res.payload) as T;
}
