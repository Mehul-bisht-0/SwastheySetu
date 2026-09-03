/**
 * FILE: apps/api/src/plugins/errors.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.3
 * STATUS: STUB — implement the error handler
 * PHASE: 2
 *
 * One place that turns any thrown value into the `errEnvelope` shape from
 * @swasthyasetu/contracts. Route handlers therefore just throw; they never
 * build an error body by hand, so no two endpoints can disagree about what an
 * error looks like.
 *
 * MAY IMPORT   fastify, zod, @swasthyasetu/contracts, ../config.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export class AppError extends Error {
 *        constructor(
 *          public code: ErrorCode,
 *          message: string,
 *          public status: number,
 *          public fields?: Record<string, string>,
 *        ) { super(message); }
 *      }
 *      NOTE: `public code` here is a PARAMETER PROPERTY, which erasableSyntaxOnly
 *      forbids (see AGENTS.md §3). Declare the fields explicitly and assign them
 *      in the body instead:
 *          code: ErrorCode; status: number; fields?: Record<string,string>;
 *          constructor(code, message, status, fields) {
 *            super(message); this.code = code; this.status = status; this.fields = fields;
 *          }
 *
 *   2. Shorthand constructors, because these are thrown constantly:
 *        export const badRequest  = (msg, fields?) => new AppError("VALIDATION_FAILED", msg, 400, fields)
 *        export const unauthorized = (msg = "Sign in required.")  => new AppError("UNAUTHORIZED", msg, 401)
 *        export const forbidden    = (msg = "Not allowed.")       => new AppError("FORBIDDEN", msg, 403)
 *        export const notFound     = (msg = "Not found.")         => new AppError("NOT_FOUND", msg, 404)
 *        export const conflict     = (msg)                        => new AppError("CONFLICT", msg, 409)
 *        export const versionConflict = (msg) => new AppError("VERSION_CONFLICT", msg, 409)
 *
 *   3. export function registerErrorHandler(app: FastifyInstance): void
 *      app.setErrorHandler((err, req, reply) => { ... }) mapping, in order:
 *
 *        a. ZodError            -> 400 VALIDATION_FAILED.
 *              fields = Object.fromEntries(err.issues.map(i => [i.path.join("."), i.message]))
 *        b. AppError            -> err.status, err.code, err.message, err.fields
 *        c. Postgres error (has a `code` string of 5 chars):
 *              "23505" unique_violation      -> 409 CONFLICT
 *              "23503" foreign_key_violation -> 400 VALIDATION_FAILED,
 *                        message "Referenced record does not exist."
 *              "23514" check_violation       -> 400 VALIDATION_FAILED
 *              anything else                 -> fall through to (d)
 *           NEVER put err.detail in the response. Postgres helpfully includes the
 *           offending VALUES in that string, which for this schema can mean a
 *           phone number or a household code. Log it; do not return it.
 *        d. anything else       -> 500 INTERNAL, message
 *              "Something went wrong." — a fixed string.
 *
 *   4. Log before replying: req.log.error({ err, requestId: req.id }, "request failed").
 *      Attach requestId to the response body so a screenshot maps to a log line.
 *
 *   5. app.setNotFoundHandler -> 404 NOT_FOUND in the same envelope, so a typo'd
 *      URL does not return Fastify's default HTML-ish body that the mobile
 *      client cannot parse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GUARDRAIL — WHAT MUST NEVER REACH THE CLIENT
 *   stack traces, SQL text, connection strings, `err.detail`, bcrypt hashes, or
 *   any raw Postgres message. In production a 500 body is exactly:
 *     { ok: false, error: { code: "INTERNAL", message: "Something went wrong.",
 *       requestId: "..." } }
 *   In development you may add `stack` — gate it on `!isProd`, never on a header.
 */

import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ErrorCode } from "@swasthyasetu/contracts";
import { isProd } from "../config.ts";

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export function badRequest(message: string, fields?: Record<string, string>): AppError {
  return new AppError("VALIDATION_FAILED", message, 400, fields);
}

export function unauthorized(message = "Sign in required."): AppError {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Not allowed."): AppError {
  return new AppError("FORBIDDEN", message, 403);
}

export function notFound(message = "Not found."): AppError {
  return new AppError("NOT_FOUND", message, 404);
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message, 409);
}

export function versionConflict(message: string): AppError {
  return new AppError("VERSION_CONFLICT", message, 409);
}

/** pg error codes we translate to application errors */
const PG_UNIQUE     = "23505";
const PG_FK         = "23503";
const PG_CHECK      = "23514";

function isPgError(err: unknown): err is { code: string; detail?: string } {
  return typeof err === "object" && err !== null && typeof (err as Record<string, unknown>)["code"] === "string" && (err as Record<string, unknown>)["code"] !== undefined && /^[0-9A-Z]{5}$/.test(String((err as Record<string, unknown>)["code"]));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err, requestId: req.id }, "request failed");

    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join(".") || "_"] = issue.message;
      }
      return reply.status(400).send({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Validation failed.", fields, requestId: req.id },
      });
    }

    if (err instanceof AppError) {
      return reply.status(err.status).send({
        ok: false,
        error: { code: err.code, message: err.message, fields: err.fields, requestId: req.id },
      });
    }

    if (isPgError(err)) {
      if (err.code === PG_UNIQUE) {
        return reply.status(409).send({
          ok: false,
          error: { code: "CONFLICT", message: "A record with those details already exists.", requestId: req.id },
        });
      }
      if (err.code === PG_FK) {
        return reply.status(400).send({
          ok: false,
          error: { code: "VALIDATION_FAILED", message: "Referenced record does not exist.", requestId: req.id },
        });
      }
      if (err.code === PG_CHECK) {
        return reply.status(400).send({
          ok: false,
          error: { code: "VALIDATION_FAILED", message: "Value violates a database constraint.", requestId: req.id },
        });
      }
    }

    // Generic fallback — never leak internals
    const errMsg = err instanceof Error ? err.message : undefined;
    const message = isProd ? "Something went wrong." : (errMsg ?? "Something went wrong.");
    return reply.status(500).send({
      ok: false,
      error: { code: "INTERNAL", message, requestId: req.id },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    return reply.status(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "Route not found.", requestId: req.id },
    });
  });
}
