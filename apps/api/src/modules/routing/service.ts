/**
 * FILE: apps/api/src/modules/routing/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.7
 * STATUS: STUB — implement recommend and toCandidate
 * PHASE: 6
 *
 * The routing engine's server-side wrapper. Fetches candidates, hands them to
 * packages/core, and shapes the answer for the wire.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALL RANKING LOGIC LIVES IN packages/core/src/facilities/rank.ts.
 *  This file must not contain a weight, a threshold, a sort comparator or a
 *  capability check. The phone runs the same ranking offline against its cached
 *  copy of these rows, and two implementations WILL drift — always in the
 *  direction of the offline one being wrong, because it is the one nobody
 *  remembers to update.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MAY IMPORT   @swasthyasetu/core, @swasthyasetu/contracts, ./repo.ts,
 *              ../triage/service.ts, ../../plugins/errors.ts
 * MUST NOT IMPORT  any AI/LLM client, ../rag/*, any HTTP client
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. function toCandidate(row: CandidateRow): FacilityCandidate
 *      snake_case row -> camelCase core type. Two things to get right:
 *        - timestamps: row.last_confirmed_at is a Date or null. Core wants an
 *          ISO string or null:  row.last_confirmed_at?.toISOString() ?? null
 *        - travelSource: row.source, passed through unchanged. It becomes
 *          `travelEstimated` in the response and drives the "estimated" label
 *          in the UI. Do not default it to "OSRM".
 *
 *   2. export async function recommend(input: RecommendRequest): Promise<RecommendResponse>
 *
 *      a. Resolve the triage result. The contract guarantees exactly one of
 *         `result` / `encounter` is present:
 *           const result = input.result ?? evaluate(input.encounter!)
 *
 *      b. const requirement = requiredCapability(encounter, result)
 *         When only `result` was supplied there is no encounter to pass. Either
 *         require the caller to send `encounter` whenever they want capability
 *         filtering, or reconstruct a minimal PatientContext from the stored
 *         report. DECIDE: pick one and write it down here — do not silently
 *         pass a fake encounter, because requiredCapability reads age and
 *         pregnancy from it and a fabricated 30-year-old male would strip the
 *         obstetric and paediatric requirements from the filter.
 *
 *      c. const rows = await candidatesForVillage(input.villageId)
 *         if (rows.length === 0) {
 *           if (!(await hasTravelTimes(input.villageId))) {
 *             // operational failure, not a clinical answer
 *             throw new AppError("INTERNAL",
 *               "Routing data is not available for this village.", 500);
 *           }
 *         }
 *
 *      d. const outcome = rankFacilities(
 *           rows.map(toCandidate), requirement, result.tier, new Date().toISOString()
 *         )
 *
 *      e. Map RankingOutcome -> RecommendResponse. Carry `fallbackApplied` and
 *         `unmetRequirements` through UNCHANGED. They are the honest part of the
 *         answer: "the nearest place that can help does not do caesareans" is
 *         information a user needs, and dropping the flag to make the list look
 *         tidy is exactly the failure this project exists to prevent.
 *
 *      f. disclaimer: NON_DIAGNOSTIC_DISCLAIMER from core. Always populated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AN EMPTY LIST IS A VALID ANSWER
 *   If nothing qualifies even after the fallback ladder, return results: [].
 *   The app shows the emergency-number card. Do not widen the radius, do not
 *   drop the minimum level below what the ladder allows, and do not return the
 *   nearest sub-centre "so the screen is not empty". Sending an obstetric
 *   emergency to a facility that cannot treat it costs a second journey the
 *   patient may not survive.
 */

import type { facilities as facilityContracts } from "@swasthyasetu/contracts";
import type { FacilityCandidate } from "@swasthyasetu/core";
import {
  NON_DIAGNOSTIC_DISCLAIMER,
  rankFacilities,
  requiredCapability,
} from "@swasthyasetu/core";

import { candidatesForVillage, hasTravelTimes, type CandidateRow } from "./repo.ts";
import { evaluate } from "../triage/service.ts";
import { AppError } from "../../plugins/errors.ts";

type RecommendRequest = ReturnType<typeof facilityContracts.recommendRequest.parse>;
type RecommendResponse = ReturnType<typeof facilityContracts.recommendResponse.parse>;

function toCandidate(row: CandidateRow): FacilityCandidate {
  return {
    facilityId:     row.facility_id,
    name:           row.name,
    facilityType:   row.facility_type,
    capabilityLevel: row.capability_level as 1|2|3|4|5,
    capabilityTags: row.capability_tags,
    travelSeconds:  row.travel_seconds,
    distanceMeters: row.distance_meters,
    travelSource:   row.source,
    lastConfirmedAt: row.last_confirmed_at?.toISOString() ?? null,
    lastNegativeAt:  row.last_negative_at?.toISOString() ?? null,
    latitude:  row.latitude,
    longitude: row.longitude,
    phone:     row.phone,
  };
}

export async function recommend(input: RecommendRequest): Promise<RecommendResponse> {
  // a. Resolve triage result — exactly one of result/encounter is present (enforced by Zod refine)
  const encounter = input.encounter ?? {
    patient: { ageMonths: 360, sex: "male" as const, pregnancy: "no" as const },
    symptoms: [],
    answers: {},
  };
  const result = input.result ?? evaluate(encounter);

  // b. Capability requirement
  const requirement = requiredCapability(encounter, result);

  // c. Fetch candidates
  const rows = await candidatesForVillage(input.villageId);
  if (rows.length === 0) {
    if (!(await hasTravelTimes(input.villageId))) {
      throw new AppError("INTERNAL", "Routing data is not available for this village.", 500);
    }
  }

  // d. Rank
  const outcome = rankFacilities(
    rows.map(toCandidate),
    requirement,
    result.tier,
    new Date().toISOString(),
  );

  // e+f. Map to wire format
  return {
    tier: result.tier,
    requirement: {
      minLevel: outcome.requirement.minLevel,
      requiredTags: outcome.requirement.requiredTags as RecommendResponse["requirement"]["requiredTags"],
    },
    results: outcome.results.map((r) => ({
      facility: {
        facilityId:      r.facility.facilityId,
        name:            r.facility.name,
        facilityType:    r.facility.facilityType as RecommendResponse["results"][0]["facility"]["facilityType"],
        capabilityLevel: r.facility.capabilityLevel,
        capabilityTags:  r.facility.capabilityTags as RecommendResponse["results"][0]["facility"]["capabilityTags"],
        districtCode:    input.villageId, // placeholder — enriched in Phase 6 if needed
        latitude:        r.facility.latitude,
        longitude:       r.facility.longitude,
        phone:           r.facility.phone,
        lastConfirmedAt: r.facility.lastConfirmedAt,
        lastNegativeAt:  r.facility.lastNegativeAt,
        isDemoData:      true,
      },
      score:         r.score,
      breakdown:     r.breakdown,
      freshness:     r.freshness,
      travelSeconds: r.facility.travelSeconds,
      distanceMeters: r.facility.distanceMeters,
      travelEstimated: r.travelEstimated,
      reasons:       r.reasons,
      rank:          r.rank,
    })),
    fallbackApplied:    outcome.fallbackApplied,
    unmetRequirements:  outcome.unmetRequirements as RecommendResponse["unmetRequirements"],
    disclaimer:         NON_DIAGNOSTIC_DISCLAIMER,
  };
}
