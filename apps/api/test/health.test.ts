/**
 * FILE: apps/api/test/health.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.4
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 2
 *
 * NEEDS NO DATABASE — that is the point. This suite passes with Postgres
 * stopped, and it is the first thing to make green in phase 2. If it passes,
 * config.ts loaded, buildApp() wired the plugins in the right order, and the
 * error handler is not swallowing routes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { testApp, body } from "./helpers.ts";

interface Health {
  status: "ok" | "degraded";
  version: string;
  database: "up" | "down";
  ragEnabled: boolean;
  time: string;
}

async function get(url: string) {
  const app = await testApp();
  return app.inject({ method: "GET", url });
}

test("GET /health is 200 whether or not the database is up", async () => {
  const res = await get("/health");
  assert.equal(res.statusCode, 200, "a health check that 503s gets the container restart-looped");
});

test("status reflects the database, and the two agree", async () => {
  const { data } = body<{ ok: boolean; data: Health }>(await get("/health"));
  assert.ok(data.status === "ok" || data.status === "degraded");
  assert.equal(data.status === "ok", data.database === "up", "status and database must not disagree");
});

test("the response carries a version and a timestamp", async () => {
  const { data } = body<{ ok: boolean; data: Health }>(await get("/health"));
  assert.match(data.version, /^\d+\.\d+\.\d+$/);
  assert.ok(!Number.isNaN(Date.parse(data.time)));
});

test("ragEnabled is a boolean the mobile app can trust", async () => {
  // The app hides the guidance entry point entirely when this is false.
  // A string "false" is truthy in JS and would show a feature that does not exist.
  const { data } = body<{ ok: boolean; data: Health }>(await get("/health"));
  assert.equal(typeof data.ragEnabled, "boolean");
});

test("GUARDRAIL: health leaks no configuration", async () => {
  const res = await get("/health");
  const text = res.payload.toLowerCase();
  for (const secret of ["postgres://", "password", "jwt_secret", "database_url", "secret"]) {
    assert.equal(text.includes(secret), false, `/health exposes "${secret}"`);
  }
});

test("an unknown path is a 404 in the standard error envelope", async () => {
  const res = await get("/does-not-exist");
  assert.equal(res.statusCode, 404);
  const parsed = body<{ ok: boolean; error: { code: string; message: string } }>(res);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error.code.length > 0, "errors are always { ok: false, error: { code, message } }");
});

test("RAG is not implemented, and says so honestly", async () => {
  const app = await testApp();
  const res = await app.inject({
    method: "POST",
    url: "/rag/ask",
    payload: { question: "What is the treatment for fever?" },
  });
  assert.equal(res.statusCode, 501);
  const parsed = body<{ ok: boolean; error: { code: string } }>(res);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "NOT_IMPLEMENTED");
});
