/**
 * FILE: apps/api/src/modules/asha/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.9
 * STATUS: STUB — implement the three functions
 * PHASE: 8
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function myVillages(districtCode: string): Promise<VillagesResponse>
 *     Straight map of villagesForDistrict(). The app caches this on first login
 *     so the village picker works with no network.
 *
 *   export async function saveVisit(
 *     input: UpsertVisitRequest, ashaId: string
 *   ): Promise<UpsertVisitResponse>
 *
 *     const row = await upsertVisit(input, ashaId);
 *     if (row === null) {
 *       throw versionConflict(
 *         "This visit was updated more recently on another device."
 *       );
 *     }
 *     return { visitId: input.visitId, entityVersion: row.entityVersion, created: row.created };
 *
 *     Null means the version guard rejected the write (see repo.ts step 2a).
 *     Surface it as VERSION_CONFLICT so the device keeps its local copy and
 *     shows it for reconciliation. Do NOT retry server-side and do NOT force the
 *     write through: the row already on the server is newer, and overwriting it
 *     destroys somebody's more recent observation.
 *
 *   export async function visits(
 *     ashaId: string, q: ListVisitsQuery
 *   ): Promise<ListVisitsResponse>
 *     Map VisitRow -> HouseholdVisit. Dates to ISO strings; `notes: row.notes ?? undefined`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A SUPERVISOR SEES ONLY AGGREGATES IN v1
 *   There is no "list another ASHA's visits" endpoint, and adding one needs a
 *   deliberate decision about who may read household-level data, not a
 *   convenience commit. Until that decision is made and written into
 *   docs/SAFETY.md, every read here is scoped to req.user.sub.
 */

import type { asha as ashaContracts } from "@swasthyasetu/contracts";

import { listVisits, upsertVisit, villagesForDistrict } from "./repo.ts";
import { versionConflict } from "../../plugins/errors.ts";

type UpsertVisitRequest = ReturnType<typeof ashaContracts.upsertVisitRequest.parse>;
type UpsertVisitResponse = ReturnType<typeof ashaContracts.upsertVisitResponse.parse>;
type ListVisitsQuery = ReturnType<typeof ashaContracts.listVisitsQuery.parse>;
type ListVisitsResponse = ReturnType<typeof ashaContracts.listVisitsResponse.parse>;
type VillagesResponse = ReturnType<typeof ashaContracts.villagesResponse.parse>;

export async function myVillages(districtCode: string): Promise<VillagesResponse> {
  const rows = await villagesForDistrict(districtCode);
  return {
    items: rows.map((row) => ({
      villageId: row.village_id,
      name: row.name,
      districtCode: row.district_code,
      latitude: row.latitude,
      longitude: row.longitude,
      population: row.population,
    })),
  };
}

export async function saveVisit(
  input: UpsertVisitRequest,
  ashaId: string,
): Promise<UpsertVisitResponse> {
  const row = await upsertVisit(input, ashaId);
  if (row === null) {
    throw versionConflict("This visit was updated more recently on another device.");
  }
  return {
    visitId: input.visitId,
    entityVersion: row.entityVersion,
    created: row.created,
  };
}

export async function visits(
  ashaId: string,
  q: ListVisitsQuery,
): Promise<ListVisitsResponse> {
  const rows = await listVisits(ashaId, q);
  return {
    items: rows.map((row) => ({
      visitId: row.visit_id,
      villageId: row.village_id,
      householdCode: row.household_code,
      visitedAt: row.visited_at.toISOString(),
      membersSeen: row.members_seen,
      dangerSigns: row.danger_signs,
      referralMade: row.referral_made,
      findings: row.findings,
      notes: row.notes ?? undefined,
      entityVersion: row.entity_version,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
