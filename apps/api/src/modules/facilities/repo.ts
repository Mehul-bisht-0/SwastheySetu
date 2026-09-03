/**
 * FILE: apps/api/src/modules/facilities/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.8
 * STATUS: STUB — implement the queries
 * PHASE: 4
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export async function nearby(
 *        lat: number, lon: number, radiusMeters: number, limit: number
 *      ): Promise<FacilityRow[]>
 *
 *        SELECT f.*, ST_Distance(f.geom, $1::geography)::int AS distance_meters
 *          FROM facilities f
 *         WHERE ST_DWithin(f.geom, $1::geography, $2)
 *         ORDER BY f.geom <-> $1::geography
 *         LIMIT $3
 *
 *      THREE THINGS THAT ARE EASY TO GET WRONG HERE:
 *
 *        a. Build the point as ST_SetSRID(ST_MakePoint($lon, $lat), 4326).
 *           LONGITUDE FIRST. Swapping them puts every facility in the sea off
 *           Somalia, and the query still succeeds — it just returns nothing.
 *
 *        b. The column is geography, not geometry, so ST_Distance returns
 *           METRES. With geometry it returns degrees, which look like small
 *           plausible numbers and are wrong by a factor of ~111,000.
 *
 *        c. ORDER BY uses the <-> KNN operator so the GiST index
 *           (facilities_geom_gix) does the sorting. `ORDER BY ST_Distance(...)`
 *           cannot use the index and degrades to a full scan plus sort.
 *
 *      ST_DWithin is the filter, not `ST_Distance(...) < r` — only the former
 *      is index-assisted.
 *
 *   2. export async function byId(facilityId: string): Promise<FacilityRow | null>
 *
 *   3. export async function insertSignal(
 *        input: CreateSignalRequest, userId: string, client?: pg.PoolClient
 *      ): Promise<{ created: boolean }>
 *
 *        INSERT INTO facility_activity
 *          (activity_id, facility_id, signal_type, observed_at, submitted_by, device_id, note)
 *        VALUES ($1,$2,$3,$4,$5,$6,$7)
 *        ON CONFLICT (activity_id) DO NOTHING
 *        RETURNING activity_id
 *
 *      DO NOT UPDATE facilities.last_confirmed_at here. The trigger
 *      `activity_bumps_freshness` in 005_facility_activity.sql does it, using
 *      GREATEST() so a late-arriving older signal cannot move freshness
 *      backwards. Writing it from application code as well would race with the
 *      trigger and let a stale offline signal overwrite newer evidence.
 *
 *   4. export async function freshnessFor(facilityId: string):
 *        Promise<{ last_confirmed_at: Date|null; last_negative_at: Date|null }>
 *      Read back AFTER the insert so the response reflects the trigger's effect.
 *
 *   5. export async function pullPage(
 *        since: string | null, cursor: string | null, limit: number, districtCode?: string
 *      ): Promise<FacilityRow[]>
 *
 *      The /sync/pull page. Tuple cursor, never OFFSET:
 *        WHERE ($1::timestamptz IS NULL OR updated_at > $1)
 *          AND ($2::timestamptz IS NULL OR (updated_at, facility_id) > ($2, $3))
 *        ORDER BY updated_at, facility_id
 *        LIMIT $4
 *      Matches the facilities_pull_cursor index. OFFSET would silently skip rows
 *      when a facility is updated mid-sync, and the device would never learn
 *      about it.
 */

import type pg from "pg";
import type { facilities as facilityContracts } from "@swasthyasetu/contracts";
import { query } from "../../db/pool.ts";

type CreateSignalRequest = ReturnType<typeof facilityContracts.createSignalRequest.parse>;

export interface FacilityRow {
  facility_id: string;
  name: string;
  facility_type: string;
  capability_level: number;
  capability_tags: string[];
  district_code: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  last_confirmed_at: Date | null;
  last_negative_at: Date | null;
  is_demo_data: boolean;
  updated_at: Date;
  distance_meters?: number;
}

export async function nearby(
  lat: number,
  lon: number,
  radiusMeters: number,
  limit: number,
): Promise<FacilityRow[]> {
  const point = `ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography`;
  return query<FacilityRow>(
    `SELECT f.facility_id, f.name, f.facility_type, f.capability_level, f.capability_tags,
            f.district_code, f.latitude, f.longitude, f.phone,
            f.last_confirmed_at, f.last_negative_at, f.is_demo_data, f.updated_at,
            ST_Distance(f.geom, ${point})::int AS distance_meters
       FROM facilities f
      WHERE ST_DWithin(f.geom, ${point}, $3)
      ORDER BY f.geom <-> ${point}
      LIMIT $4`,
    [lat, lon, radiusMeters, limit],
  );
}

export async function byId(facilityId: string): Promise<FacilityRow | null> {
  const rows = await query<FacilityRow>(
    `SELECT facility_id, name, facility_type, capability_level, capability_tags,
            district_code, latitude, longitude, phone,
            last_confirmed_at, last_negative_at, is_demo_data, updated_at
       FROM facilities WHERE facility_id = $1`,
    [facilityId],
  );
  return rows[0] ?? null;
}

export async function insertSignal(
  input: CreateSignalRequest,
  userId: string,
  client?: pg.PoolClient,
): Promise<{ created: boolean }> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  const rows = await run(
    `INSERT INTO facility_activity
       (activity_id, facility_id, signal_type, observed_at, submitted_by, device_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (activity_id) DO NOTHING
     RETURNING activity_id`,
    [
      input.activityId,
      input.facilityId,
      input.signalType,
      input.observedAt,
      userId,
      input.deviceId ?? null,
      input.note ?? null,
    ],
  );
  return { created: (rows as unknown[]).length > 0 };
}

export async function freshnessFor(
  facilityId: string,
): Promise<{ last_confirmed_at: Date | null; last_negative_at: Date | null }> {
  const rows = await query<{ last_confirmed_at: Date | null; last_negative_at: Date | null }>(
    `SELECT last_confirmed_at, last_negative_at FROM facilities WHERE facility_id = $1`,
    [facilityId],
  );
  return rows[0] ?? { last_confirmed_at: null, last_negative_at: null };
}

export async function pullPage(
  since: string | null,
  cursor: string | null,
  limit: number,
  districtCode?: string,
): Promise<FacilityRow[]> {
  // Parse the tuple cursor: "<iso_ts>|<uuid>"
  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const idx = cursor.indexOf("|");
    if (idx !== -1) {
      cursorTs = cursor.substring(0, idx) ?? null;
      cursorId = cursor.substring(idx + 1) ?? null;
    }
  }

  return query<FacilityRow>(
    `SELECT facility_id, name, facility_type, capability_level, capability_tags,
            district_code, latitude, longitude, phone,
            last_confirmed_at, last_negative_at, is_demo_data, updated_at
       FROM facilities
      WHERE ($1::timestamptz IS NULL OR updated_at > $1::timestamptz)
        AND ($2::timestamptz IS NULL OR (updated_at, facility_id) > ($2::timestamptz, $3::uuid))
        AND ($4::text IS NULL OR district_code = $4)
      ORDER BY updated_at, facility_id
      LIMIT $5`,
    [since, cursorTs, cursorId, districtCode ?? null, limit],
  );
}
