/**
 * FILE: apps/api/src/plugins/observability.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.3
 * STATUS: STUB — implement registerObservability
 * PHASE: 2
 *
 * Request ids, structured logging, and the redaction rules that keep patient
 * data out of the log file.
 *
 * MAY IMPORT   fastify, node:crypto, ../config.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export function loggerOptions()
 *      Returned from app.ts when constructing Fastify:
 *        {
 *          level: config.LOG_LEVEL,
 *          redact: {
 *            paths: [
 *              'req.headers.authorization',
 *              'req.headers.cookie',
 *              'req.body.password',
 *              'req.body.encounter',        // symptoms are health data
 *              'req.body.answers',
 *              'req.body.notes',
 *              'req.body.householdCode',
 *              'req.body.operations',       // sync batches contain all of the above
 *              '*.password_hash',
 *            ],
 *            censor: '[redacted]',
 *          },
 *          transport: isProd ? undefined
 *                            : { target: 'pino-pretty', options: { colorize: true } },
 *        }
 *      NOTE the transport line requires pino-pretty, which is NOT in
 *      package.json. Either add it as a devDependency or drop the transport —
 *      do not leave a reference to a package that is not installed.
 *
 *   2. export function registerObservability(app: FastifyInstance)
 *        - genReqId: (req) => req.headers["x-request-id"] ?? randomUUID()
 *          (honour an inbound id so a mobile trace and a server trace join up)
 *        - onSend hook: reply.header("x-request-id", req.id)
 *        - onResponse hook: log { method, url, status, ms: reply.elapsedTime }
 *
 *   3. Slow-query breadcrumb: if reply.elapsedTime > 500, log at WARN with the
 *      route. /facilities/recommend must be an index scan (see the note on
 *      travel_times_lookup in 006_routing.sql); if it starts appearing here, the
 *      precomputed table is being bypassed and a live route calculation has
 *      crept in.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER LOG
 *   symptom codes, answers, ages, household codes, phone numbers, JWTs,
 *   password hashes, or whole request bodies from /triage/* and /sync/push.
 *
 *   Log ids and shapes instead — "report 3f2a… stored, tier=EMERGENCY" is enough
 *   to debug with and reveals nothing about a person. Tier alone is fine; tier
 *   plus village plus age is re-identifying in a village of 800 people.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config, isProd } from "../config.ts";

export function loggerOptions(): Record<string, unknown> {
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.encounter",
        "req.body.answers",
        "req.body.notes",
        "req.body.householdCode",
        "req.body.operations",
        "*.password_hash",
      ],
      censor: "[redacted]",
    },
    // pino-pretty is not installed; use plain JSON in all environments
    // to avoid a missing-package crash. Add pino-pretty as a devDependency
    // if human-readable dev logs are needed.
  };
}

export function registerObservability(app: FastifyInstance): void {
  // Attach request id from inbound header or generate a new one
  app.addHook("onRequest", (req, _reply, done) => {
    const inbound = req.headers["x-request-id"];
    if (typeof inbound === "string" && inbound.length > 0) {
      (req as unknown as { id: string }).id = inbound;
    } else {
      (req as unknown as { id: string }).id = randomUUID();
    }
    done();
  });

  // Echo the request id back on every response
  app.addHook("onSend", (_req, reply, _payload, done) => {
    void reply.header("x-request-id", _req.id);
    done();
  });

  // Log completed requests; warn on slow ones
  app.addHook("onResponse", (req, reply, done) => {
    const ms = Math.round(reply.elapsedTime);
    const logData = { method: req.method, url: req.url, status: reply.statusCode, ms };
    if (ms > 500) {
      req.log.warn(logData, "slow request");
    } else {
      req.log.info(logData, "request completed");
    }
    done();
  });
}
