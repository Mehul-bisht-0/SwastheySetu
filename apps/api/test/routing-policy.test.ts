/**
 * Regression coverage for the Phase 6 encounter-required routing policy.
 * A triage result has urgency but not the patient context needed to derive
 * paediatric and obstetric facility requirements.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { body, testApp } from "./helpers.ts";

test("facility recommendations reject result-only requests before routing", async () => {
  const app = await testApp();
  const encounter = {
    patient: { ageMonths: 24, sex: "female", pregnancy: "unknown" },
    symptoms: ["FEVER"],
    answers: {},
  };

  const evaluated = await app.inject({
    method: "POST",
    url: "/triage/evaluate",
    payload: { encounter },
  });
  assert.equal(evaluated.statusCode, 200);
  const result = body<{ data: { result: unknown } }>(evaluated).data.result;

  const response = await app.inject({
    method: "POST",
    url: "/facilities/recommend",
    payload: {
      villageId: "00000000-0000-4000-8000-000000000001",
      result,
    },
  });

  assert.equal(response.statusCode, 400);
  const parsed = body<{ ok: boolean; error: { code: string; message: string } }>(response);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "VALIDATION_FAILED");
  assert.match(parsed.error.message, /encounter is required/i);
});
