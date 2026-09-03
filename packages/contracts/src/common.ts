/**
 * FILE: packages/contracts/src/common.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.1
 * STATUS: COMPLETE — do not modify
 *
 * Primitives every other schema builds on, plus the two envelope shapes every
 * endpoint returns. Written in full because these are the pieces that get
 * copy-pasted-and-subtly-changed otherwise.
 *
 * WHY THE ENVELOPE IS DISCRIMINATED
 *   { ok: true, data } | { ok: false, error } means the mobile app can branch on
 *   one boolean instead of guessing from HTTP status codes — which it often
 *   cannot see anyway, because the request failed offline before it got a status.
 */

import { z } from "zod";

// ------------------------------------------------------------ primitives

/** UUID v4 specifically — clients generate these, so the version matters. */
export const uuid = z.string().uuid();

/** ISO 8601 with offset. Never accept a bare date: timezone bugs in a health app are not funny. */
export const isoDateTime = z.string().datetime({ offset: true });

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** LGD district code. Free text upstream, so only shape is enforced. */
export const districtCode = z.string().min(1).max(16);

/** Opaque, stable, client-generated. Not a hardware id — see docs/SAFETY.md. */
export const deviceId = z.string().min(8).max(128);

export const ageMonths = z.number().int().min(0).max(1500);
export const sex = z.enum(["male", "female", "other", "unknown"]);
export const pregnancy = z.enum(["yes", "no", "unknown"]);
export const urgencyTier = z.enum(["EMERGENCY", "GO_NOW", "PHC_SOON", "SELF_CARE"]);

/** Mirrors CapabilityLevel in @swasthyasetu/core. 1 = sub-centre … 5 = district hospital. */
export const capabilityLevel = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * MIRRORS capability_codes in infra/migrations/004_facilities.sql AND `CAP` in
 * packages/core/src/facilities/capability.ts. All three lists must agree.
 */
export const capabilityTag = z.enum([
  "EMERGENCY_24X7",
  "DELIVERY",
  "CAESAREAN",
  "NEWBORN_CARE",
  "PAEDIATRIC",
  "INPATIENT",
  "LAB_BASIC",
  "PHARMACY",
  "AMBULANCE",
  "OPD",
  "OXYGEN",
  "BLOOD_BANK",
  "ICU",
]);

export const facilityType = z.enum([
  "SUBCENTRE",
  "PHC",
  "CHC",
  "SDH",
  "DH",
  "PRIVATE_CLINIC",
]);

export const freshnessBand = z.enum([
  "FRESH",
  "AGING",
  "STALE",
  "REPORTED_CLOSED",
  "UNKNOWN",
]);

// ------------------------------------------------------------ errors

/**
 * The closed set of machine-readable error codes.
 *
 * Closed, not open, because the mobile app switches on these to decide whether
 * to retry, re-queue, or surface a message. A typo'd code would silently fall
 * through to "unknown error" and the write would be lost.
 */
export const errorCode = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VERSION_CONFLICT",
  "RATE_LIMITED",
  "NOT_IMPLEMENTED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof errorCode>;

export const apiError = z.object({
  code: errorCode,
  /** Human-readable, safe to show a user. Never contains SQL, stack traces or PII. */
  message: z.string(),
  /** Field-level detail for VALIDATION_FAILED. Keyed by dotted path. */
  fields: z.record(z.string(), z.string()).optional(),
  /** Echoed from the x-request-id header so a user screenshot maps to a log line. */
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiError>;

// ------------------------------------------------------------ envelope

/**
 * Wrap a payload schema in the success envelope.
 *
 * Usage in a route:  reply.send({ ok: true, data })
 * Usage in a test:   okEnvelope(triageResponse).parse(body)
 */
export function okEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

export const errEnvelope = z.object({ ok: z.literal(false), error: apiError });

/** Convenience for the mobile client: parse either arm in one call. */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.union([okEnvelope(data), errEnvelope]);
}

export type Ok<T> = { ok: true; data: T };
export type Err = z.infer<typeof errEnvelope>;
export type ApiResponse<T> = Ok<T> | Err;

// ------------------------------------------------------------ pagination

/**
 * Tuple cursor, opaque to the client: base64("<iso timestamp>|<uuid>").
 *
 * WHY A TUPLE AND NOT AN OFFSET
 *   Rows change between pages during a long sync. `(updated_at, id) > (t, id)`
 *   is stable under concurrent writes; `OFFSET 200` silently skips rows.
 *   The matching index is facilities_pull_cursor in 004_facilities.sql.
 */
export const cursor = z.string().max(256);

export const pageQuery = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof pageQuery>;

export function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    /** null means "you have everything". Absent would be ambiguous. */
    nextCursor: z.string().nullable(),
  });
}

// ------------------------------------------------------------ health

export const healthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  /** Checked with SELECT 1; the API stays up and reports degraded if this fails. */
  database: z.enum(["up", "down"]),
  /** Always false in v1. The demo must never imply RAG is running. */
  ragEnabled: z.boolean(),
  time: isoDateTime,
});
export type HealthResponse = z.infer<typeof healthResponse>;
