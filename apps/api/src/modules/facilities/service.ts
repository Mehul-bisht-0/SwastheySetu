/**
 * FILE: apps/api/src/modules/facilities/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.8
 * STATUS: STUB — implement the three functions
 * PHASE: 4
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  GUARDRAIL 3 — THE HONESTY RULE, ENFORCED HERE
 *
 *  This service is the ONLY place a facility's evidence is turned into words.
 *  It calls `assessFreshness` from core and returns the band, the confidence,
 *  the age in days and the pre-rendered copy.
 *
 *  It must never produce, and the response must never contain, a claim that a
 *  facility is "open", "available", "operational" or "closed right now". The
 *  database does not know any of those things. What it knows is that somebody
 *  reported something on a date, which is why the copy reads
 *  "Confirmed 2 days ago" and not "Open".
 *
 *  facilities/freshness.test.ts has a banned-phrase test that fails the build
 *  if this slips.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export function toFreshness(row): FreshnessAssessment
 *        assessFreshness(
 *          row.last_confirmed_at?.toISOString() ?? null,
 *          row.last_negative_at?.toISOString() ?? null,
 *          new Date().toISOString(),
 *        )
 *      One call. Do not post-process the `copy` string, do not "improve" the
 *      wording per screen, and do not add a cheerier variant for the empty case.
 *
 *   2. export async function listNearby(q: NearbyQuery): Promise<NearbyResponse>
 *        - villageId given  -> look up its centroid, use that lat/lon
 *        - lat/lon given    -> use them directly
 *        - neither          -> throw badRequest("Provide villageId or lat/lon.")
 *        Then repo.nearby(), map each row, attach toFreshness(row).
 *
 *   3. export async function submitSignal(
 *        input: CreateSignalRequest, userId: string
 *      ): Promise<CreateSignalResponse>
 *
 *        a. const facility = await byId(input.facilityId)
 *           if (!facility) throw notFound("Facility not found.")
 *        b. REJECT A FUTURE observedAt more than 1 day ahead — the CHECK
 *           constraint in 005 will reject it anyway, but a clear 400 beats a
 *           Postgres check violation surfacing as a generic error. Mild skew is
 *           tolerated: field devices genuinely have wrong clocks, and refusing
 *           the report would lose real evidence to protect a timestamp.
 *        c. const { created } = await insertSignal(input, userId)
 *        d. const fresh = await freshnessFor(input.facilityId)   // AFTER the trigger
 *        e. return { activityId, created, freshness: toFreshness(fresh) }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE RESPONSE CARRIES FRESHNESS BACK
 *   The ASHA app updates its local cache immediately from this reply, so her
 *   next screen shows "Confirmed just now" without waiting for the next sync.
 *   That instant feedback is what makes reporting feel worth doing — and a
 *   signal nobody bothers to send is a facility nobody has evidence about.
 */

import type { facilities as facilityContracts } from "@swasthyasetu/contracts";
import type { FreshnessAssessment } from "@swasthyasetu/core";
import { assessFreshness } from "@swasthyasetu/core";

import { byId, freshnessFor, insertSignal, nearby } from "./repo.ts";
import { badRequest, notFound } from "../../plugins/errors.ts";

type NearbyQuery = ReturnType<typeof facilityContracts.nearbyQuery.parse>;
type NearbyResponse = ReturnType<typeof facilityContracts.nearbyResponse.parse>;
type CreateSignalRequest = ReturnType<typeof facilityContracts.createSignalRequest.parse>;
type CreateSignalResponse = ReturnType<typeof facilityContracts.createSignalResponse.parse>;

export function toFreshness(row: {
  last_confirmed_at: Date | null;
  last_negative_at: Date | null;
}): FreshnessAssessment {
  return assessFreshness(
    row.last_confirmed_at?.toISOString() ?? null,
    row.last_negative_at?.toISOString() ?? null,
    new Date().toISOString(),
  );
}

export async function listNearby(q: NearbyQuery): Promise<NearbyResponse> {
  let lat: number;
  let lon: number;

  if (q.latitude !== undefined && q.longitude !== undefined) {
    lat = q.latitude;
    lon = q.longitude;
  } else {
    throw badRequest("Provide either villageId or latitude and longitude.");
  }

  const rows = await nearby(lat, lon, q.radiusMeters, q.limit);
  return {
    items: rows.map((row) => ({
      facilityId:      row.facility_id,
      name:            row.name,
      facilityType:    row.facility_type as NearbyResponse["items"][0]["facilityType"],
      capabilityLevel: row.capability_level as 1|2|3|4|5,
      capabilityTags:  row.capability_tags as NearbyResponse["items"][0]["capabilityTags"],
      districtCode:    row.district_code,
      latitude:        row.latitude,
      longitude:       row.longitude,
      phone:           row.phone,
      lastConfirmedAt: row.last_confirmed_at?.toISOString() ?? null,
      lastNegativeAt:  row.last_negative_at?.toISOString() ?? null,
      isDemoData:      row.is_demo_data,
      distanceMeters:  row.distance_meters ?? 0,
      freshness:       toFreshness(row),
    })),
  };
}

export async function submitSignal(
  input: CreateSignalRequest,
  userId: string,
): Promise<CreateSignalResponse> {
  const facility = await byId(input.facilityId);
  if (!facility) throw notFound("Facility not found.");

  // Reject a future observedAt more than 1 day ahead
  const observedMs = Date.parse(input.observedAt);
  if (observedMs > Date.now() + 86_400_000) {
    throw badRequest("observedAt is too far in the future.");
  }

  const { created } = await insertSignal(input, userId);
  const fresh = await freshnessFor(input.facilityId);

  return {
    activityId: input.activityId,
    created,
    freshness: toFreshness(fresh),
  };
}
