/**
 * FILE: apps/api/src/modules/asha/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.9
 * STATUS: STUB — implement the queries
 * PHASE: 8
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export async function villagesForDistrict(districtCode: string): Promise<VillageRow[]>
 *        SELECT village_id, name, district_code,
 *               ST_Y(centroid::geometry) AS latitude,
 *               ST_X(centroid::geometry) AS longitude,
 *               population
 *          FROM villages WHERE district_code = $1 ORDER BY name
 *
 *      ST_Y is LATITUDE and ST_X is LONGITUDE. The cast to ::geometry is
 *      required — ST_X/ST_Y do not accept geography. Getting this pair the wrong
 *      way round is the same bug as ST_MakePoint's argument order, and it fails
 *      just as quietly.
 *
 *   2. export async function upsertVisit(
 *        input: UpsertVisitRequest, ashaId: string, client?: pg.PoolClient
 *      ): Promise<{ created: boolean; entityVersion: number }>
 *
 *      LAST-WRITE-WINS WITH A VERSION GUARD, in one statement:
 *
 *        INSERT INTO household_visits (
 *          visit_id, asha_id, village_id, household_code, visited_at,
 *          members_seen, danger_signs, referral_made, findings, notes,
 *          entity_version, device_id, created_at
 *        ) VALUES ($1,...,$13)
 *        ON CONFLICT (visit_id) DO UPDATE SET
 *          household_code = EXCLUDED.household_code,
 *          visited_at     = EXCLUDED.visited_at,
 *          members_seen   = EXCLUDED.members_seen,
 *          danger_signs   = EXCLUDED.danger_signs,
 *          referral_made  = EXCLUDED.referral_made,
 *          findings       = EXCLUDED.findings,
 *          notes          = EXCLUDED.notes,
 *          entity_version = EXCLUDED.entity_version
 *        WHERE household_visits.entity_version < EXCLUDED.entity_version
 *        RETURNING (xmax = 0) AS created, entity_version
 *
 *      THREE THINGS TO UNDERSTAND ABOUT THAT STATEMENT:
 *
 *        a. The WHERE on DO UPDATE is the conflict guard. A write whose
 *           entity_version is not strictly greater is skipped, and RETURNING
 *           yields NO ROW. Zero rows therefore means "stale write" — the service
 *           turns that into a VERSION_CONFLICT. Without the guard, a device that
 *           has been offline for a week would silently overwrite edits made
 *           since, and the ASHA would never know her correction was lost.
 *
 *        b. `xmax = 0` distinguishes insert from update in the same statement.
 *           It is a Postgres implementation detail, but it is the only way to
 *           get created/updated out of a single upsert.
 *
 *        c. asha_id is bound from the AUTHENTICATED USER, never from the body.
 *           Otherwise one worker can file visits under another's name.
 *
 *   3. export async function listVisits(
 *        ashaId: string, q: ListVisitsQuery
 *      ): Promise<VisitRow[]>
 *        WHERE asha_id = $1
 *          AND ($2::uuid IS NULL OR village_id = $2)
 *          AND ($3::timestamptz IS NULL OR visited_at >= $3)
 *        ORDER BY visited_at DESC LIMIT $4
 *
 *      SCOPE BY asha_id IN SQL. Not in JavaScript after the fact — rows that
 *      never leave the database cannot be leaked by a mapping bug.
 */

import type pg from "pg";
import type { asha as ashaContracts } from "@swasthyasetu/contracts";
import { query } from "../../db/pool.ts";

type UpsertVisitRequest = ReturnType<typeof ashaContracts.upsertVisitRequest.parse>;
type ListVisitsQuery = ReturnType<typeof ashaContracts.listVisitsQuery.parse>;

export interface VillageRow {
  village_id: string;
  name: string;
  district_code: string;
  latitude: number;
  longitude: number;
  population: number | null;
}

export interface VisitRow {
  visit_id: string;
  village_id: string;
  household_code: string;
  visited_at: Date;
  members_seen: number;
  danger_signs: string[];
  referral_made: boolean;
  findings: Record<string, unknown>;
  notes: string | null;
  entity_version: number;
  created_at: Date;
}

export async function villagesForDistrict(districtCode: string): Promise<VillageRow[]> {
  throw new Error("NOT_IMPLEMENTED: villagesForDistrict — see doc comment step 1");
}

export async function upsertVisit(
  input: UpsertVisitRequest,
  ashaId: string,
  client?: pg.PoolClient,
): Promise<{ created: boolean; entityVersion: number } | null> {
  throw new Error("NOT_IMPLEMENTED: upsertVisit — see doc comment step 2");
}

export async function listVisits(
  ashaId: string,
  q: ListVisitsQuery,
): Promise<VisitRow[]> {
  throw new Error("NOT_IMPLEMENTED: listVisits — see doc comment step 3");
}
