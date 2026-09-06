/**
 * FILE: apps/api/src/modules/routing/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.7
 * STATUS: STUB — implement the two queries
 * PHASE: 4–5
 *
 * The precomputed travel-time lookup. This is the hot path of the whole API.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEVER CALL OSRM FROM HERE.
 *  Routing is computed OFFLINE by infra/routing/precompute.ts and written to
 *  the travel_times table. At request time this is an index scan.
 *
 *  A live route call would add a network round trip to every recommendation,
 *  make the endpoint fail when OSRM is down, and — the real problem — make the
 *  same request answer differently depending on infrastructure the user cannot
 *  see. Precomputed means reproducible, and reproducible means demonstrable.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export interface CandidateRow {
 *        facility_id, name, facility_type, capability_level, capability_tags,
 *        travel_seconds, distance_meters, source,
 *        last_confirmed_at, last_negative_at, latitude, longitude, phone
 *      }
 *
 *   2. export async function candidatesForVillage(
 *        villageId: string, limit = 40
 *      ): Promise<CandidateRow[]>
 *
 *        SELECT f.facility_id, f.name, f.facility_type, f.capability_level,
 *               f.capability_tags, t.travel_seconds, t.distance_meters, t.source,
 *               f.last_confirmed_at, f.last_negative_at,
 *               f.latitude, f.longitude, f.phone
 *          FROM travel_times t
 *          JOIN facilities f USING (facility_id)
 *         WHERE t.village_id = $1
 *         ORDER BY t.travel_seconds ASC
 *         LIMIT $2
 *
 *      NOTE WHAT IS NOT IN THAT QUERY: no capability filter, no freshness
 *      filter, no scoring. Fetch a generous pool of the nearest facilities and
 *      let packages/core rank them. The ranking rules must live in the pure,
 *      unit-tested, phone-runnable package — not in SQL where they cannot be
 *      tested offline and where the phone would need a second implementation.
 *
 *      LIMIT 40 rather than 5: the fallback ladder needs candidates that fail
 *      the first filter, or it has nothing to fall back to.
 *
 *      Verify with EXPLAIN that this uses travel_times_lookup (village_id,
 *      travel_seconds). A sequential scan here is the performance bug that
 *      turns a 5ms endpoint into a 400ms one.
 *
 *   3. export async function hasTravelTimes(villageId: string): Promise<boolean>
 *        SELECT 1 FROM travel_times WHERE village_id = $1 LIMIT 1
 *
 *      Lets the service distinguish "no facility met the requirement" (an
 *      honest, useful answer) from "precompute was never run for this village"
 *      (an operational bug). Reporting the second as the first would hide a
 *      broken deployment behind a plausible-looking empty list.
 */

import { query } from "../../db/pool.ts";

export interface CandidateRow {
  facility_id: string;
  name: string;
  facility_type: string;
  capability_level: number;
  capability_tags: string[];
  district_code: string;
  is_demo_data: boolean;
  travel_seconds: number;
  distance_meters: number;
  source: "OSRM" | "ESTIMATED";
  last_confirmed_at: Date | null;
  last_negative_at: Date | null;
  latitude: number;
  longitude: number;
  phone: string | null;
}

export async function candidatesForVillage(
  villageId: string,
  limit = 40,
): Promise<CandidateRow[]> {
  return query<CandidateRow>(
    `SELECT f.facility_id, f.name, f.facility_type, f.capability_level, f.capability_tags,
            f.district_code, f.is_demo_data,
            t.travel_seconds, t.distance_meters, t.source,
            f.last_confirmed_at, f.last_negative_at,
            f.latitude, f.longitude, f.phone
       FROM travel_times t
       JOIN facilities f USING (facility_id)
      WHERE t.village_id = $1
      ORDER BY t.travel_seconds ASC
      LIMIT $2`,
    [villageId, limit],
  );
}

export async function hasTravelTimes(villageId: string): Promise<boolean> {
  const rows = await query<{ one: number }>(
    `SELECT 1 AS one FROM travel_times WHERE village_id = $1 LIMIT 1`,
    [villageId],
  );
  return rows.length > 0;
}
