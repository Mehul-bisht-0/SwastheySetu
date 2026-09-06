// Regression coverage for the patient flow's final offline save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../apps/mobile/src/db/schema.sql", import.meta.url), "utf8"));

const adapter = {
  runSync: (sql, params = []) => sqlite.prepare(sql).run(...params),
  getAllSync: (sql, params = []) => sqlite.prepare(sql).all(...params),
  getFirstSync: (sql, params = []) => sqlite.prepare(sql).get(...params),
  withTransactionSync: (fn) => {
    sqlite.exec("BEGIN");
    try {
      fn();
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};

globalThis.mobileReportsTestAdapter = adapter;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/client.ts") && context.parentURL?.includes("/apps/mobile/src/")) {
      return {
        url: "data:text/javascript," + encodeURIComponent("export const getDb=()=>globalThis.mobileReportsTestAdapter; export const tx=fn=>{let result; getDb().withTransactionSync(()=>{result=fn(getDb())}); return result;};"),
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const { saveReport, getReport } = await import("../apps/mobile/src/db/dao/reports.ts");
const { evaluateTriage } = await import("../packages/core/src/triage/evaluate.ts");

test("patient follow-up result and its sync operation save atomically", () => {
  const encounter = {
    patient: { ageMonths: 360, sex: "male", pregnancy: "no" },
    symptoms: ["FEVER"],
    answers: {
      DRINKING: "normally",
      DURATION_HOURS: 24,
      FEVER_DAYS: 2,
      ACTIVITY: "normal",
      CHRONIC_ILLNESS: false,
      GETTING_WORSE: false,
      PAIN_SCORE: 2,
    },
  };
  const result = evaluateTriage(encounter, { clock: { now: () => new Date("2026-09-06T11:00:00.000Z") } });
  const reportId = saveReport({ villageId: null, encounter, result });

  assert.equal(getReport(reportId)?.reportId, reportId);
  assert.equal(adapter.getFirstSync("SELECT COUNT(*) AS count FROM outbox").count, 1);
});

test("an emergency result saves immediately without requiring device identity", () => {
  const encounter = {
    patient: { ageMonths: 360, sex: "female", pregnancy: "unknown" },
    symptoms: ["UNCONSCIOUS"],
    answers: {},
  };
  const result = evaluateTriage(encounter, { clock: { now: () => new Date("2026-09-06T11:01:00.000Z") } });
  const reportId = saveReport({ villageId: null, encounter, result });

  assert.equal(result.tier, "EMERGENCY");
  assert.equal(getReport(reportId)?.tier, "EMERGENCY");
  const row = adapter.getFirstSync("SELECT payload FROM outbox WHERE payload LIKE ?", [`%${reportId}%`]);
  const payload = JSON.parse(row.payload);
  assert.equal(Object.hasOwn(payload, "deviceId"), false);
});
