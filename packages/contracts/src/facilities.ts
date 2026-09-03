/**
 * FILE: packages/contracts/src/facilities.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.4
 * STATUS: COMPLETE — do not modify
 *
 * The wire form of the routing engine, and the single most safety-sensitive
 * file in this package.
 *
 * GUARDRAIL 3 — THE SHAPE ENFORCES THE HONESTY RULE
 *   There is no `isOpen` field. There is no `available` field. There cannot be,
 *   because the backend does not know. What it knows is when someone last
 *   reported something about this facility, so the wire format carries evidence
 *   and its age: `lastConfirmedAt`, `ageDays`, `confidence`, and a pre-rendered
 *   `copy` string such as "Confirmed 2 days ago".
 *
 *   If you find yourself adding a boolean that means "open", stop. The field you
 *   want does not exist in the data.
 */

import { z } from "zod";
import {
  capabilityLevel,
  capabilityTag,
  districtCode,
  facilityType,
  freshnessBand,
  isoDateTime,
  latitude,
  longitude,
  urgencyTier,
  uuid,
} from "./common.ts";
import { encounter, triageResult } from "./triage.ts";

// ------------------------------------------------------------ facility

export const facility = z.object({
  facilityId: uuid,
  name: z.string(),
  facilityType,
  capabilityLevel,
  capabilityTags: z.array(capabilityTag),
  districtCode,
  latitude,
  longitude,
  phone: z.string().nullable(),
  /** Evidence timestamps, NOT an open/closed state. Null means never reported. */
  lastConfirmedAt: isoDateTime.nullable(),
  lastNegativeAt: isoDateTime.nullable(),
  /** Demo rows are watermarked in the UI. Never let seed data pass as official. */
  isDemoData: z.boolean(),
});
export type Facility = z.infer<typeof facility>;

export const freshnessAssessment = z.object({
  band: freshnessBand,
  /** exp(-ageDays / tau), tau = 14 days. 1 = reported just now, → 0 = long ago. */
  confidence: z.number().min(0).max(1),
  /** Null when there has never been a report. Not 0 — 0 would mean "today". */
  ageDays: z.number().nullable(),
  /**
   * Pre-rendered, e.g. "Confirmed 2 days ago" / "Reported closed 1 day ago" /
   * "No recent reports". Rendered server-side so every client tells the same
   * story and no screen can invent a cheerier phrasing.
   */
  copy: z.string(),
});
export type FreshnessAssessment = z.infer<typeof freshnessAssessment>;

export const rankedFacility = z.object({
  facility,
  score: z.number(),
  breakdown: z.object({
    capability: z.number(),
    time: z.number(),
    freshness: z.number(),
  }),
  freshness: freshnessAssessment,
  travelSeconds: z.number().int().min(0),
  distanceMeters: z.number().int().min(0),
  /**
   * True when travelSeconds came from the great-circle fallback rather than a
   * road route. MUST be surfaced in the UI as "estimated" — a straight-line
   * estimate across a river is not a 20-minute journey.
   */
  travelEstimated: z.boolean(),
  /** Plain-language justification, ordered most to least important. */
  reasons: z.array(z.string()),
  rank: z.number().int().min(1),
});
export type RankedFacility = z.infer<typeof rankedFacility>;

// ------------------------------------------------------------ GET /facilities/nearby

export const nearbyQuery = z.object({
  villageId: uuid.optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(500).max(100_000).default(25_000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type NearbyQuery = z.infer<typeof nearbyQuery>;

export const nearbyResponse = z.object({
  items: z.array(
    facility.extend({
      distanceMeters: z.number().int(),
      freshness: freshnessAssessment,
    }),
  ),
});
export type NearbyResponse = z.infer<typeof nearbyResponse>;

// ------------------------------------------------------------ POST /facilities/recommend

/**
 * The headline endpoint: triage outcome in, ranked facilities out.
 *
 * Accepts EITHER a `result` the device already computed offline, OR an
 * `encounter` to evaluate server-side. Never both — `.refine` below enforces it,
 * because silently preferring one would hide a client bug where the phone's
 * verdict is discarded and replaced by a different one.
 */
export const recommendRequest = z
  .object({
    villageId: uuid,
    result: triageResult.optional(),
    encounter: encounter.optional(),
    maxResults: z.number().int().min(1).max(10).default(5),
  })
  .refine((v) => Boolean(v.result) !== Boolean(v.encounter), {
    message: "provide exactly one of `result` or `encounter`",
  });
export type RecommendRequest = z.infer<typeof recommendRequest>;

export const recommendResponse = z.object({
  tier: urgencyTier,
  requirement: z.object({
    minLevel: capabilityLevel,
    requiredTags: z.array(capabilityTag),
  }),
  results: z.array(rankedFacility),
  /**
   * True when no facility met the full requirement and the ladder dropped tags
   * to find something. The UI must say so — "no nearby facility offers X" is
   * useful information, and hiding it is the failure mode this field exists to
   * prevent.
   */
  fallbackApplied: z.boolean(),
  /** The tags that had to be dropped. Empty when fallbackApplied is false. */
  unmetRequirements: z.array(capabilityTag),
  /**
   * An empty `results` array is a VALID, HONEST answer, not an error. The client
   * renders the emergency-number card instead of a list. Do not fabricate a
   * nearest-anything to avoid an empty screen.
   */
  disclaimer: z.string().min(1),
});
export type RecommendResponse = z.infer<typeof recommendResponse>;

// ------------------------------------------------------------ POST /facilities/:id/signals

/** MIRRORS signal_types in infra/migrations/005_facility_activity.sql. */
export const signalType = z.enum([
  "STAFF_PRESENT",
  "FACILITY_OPEN",
  "MEDICINE_IN_STOCK",
  "REFERRAL_ACCEPTED",
  "FACILITY_CLOSED",
  "STOCK_OUT",
]);
export type SignalType = z.infer<typeof signalType>;

/**
 * An ASHA reporting what she saw. Append-only, idempotent on activityId.
 *
 * `observedAt` is when she SAW it, not when the phone managed to send it. Those
 * differ by days in the field, and using the send time would make a week-old
 * observation look like fresh evidence.
 */
export const createSignalRequest = z.object({
  activityId: uuid,
  facilityId: uuid,
  signalType,
  observedAt: isoDateTime,
  note: z.string().max(500).optional(),
  deviceId: z.string().optional(),
});
export type CreateSignalRequest = z.infer<typeof createSignalRequest>;

export const createSignalResponse = z.object({
  activityId: uuid,
  created: z.boolean(),
  /** Recomputed after the trigger fires, so the app can update its cache immediately. */
  freshness: freshnessAssessment,
});
export type CreateSignalResponse = z.infer<typeof createSignalResponse>;
