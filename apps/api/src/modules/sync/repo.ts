/**
 * FILE: apps/api/src/modules/sync/repo.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.3
 * STATUS: STUB — implement the ledger
 * PHASE: 9
 *
 * The idempotency ledger. Small, and the part that makes offline sync correct.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. export async function findOperation(clientOpId: string, client?: pg.PoolClient)
 *        : Promise<{ payload_hash: string; status: string; result: unknown } | null>
 *
 *        SELECT payload_hash, status, result
 *          FROM sync_operations WHERE client_op_id = $1
 *
 *      Call this FOR UPDATE inside the operation's transaction if two devices
 *      might replay the same op concurrently. In practice one device owns its
 *      op ids, so a plain SELECT is fine — note the assumption here rather than
 *      leaving it implicit.
 *
 *   2. export async function recordOperation(
 *        clientOpId, deviceId, userId, opType, payloadHash,
 *        status: "APPLIED" | "REJECTED", result: unknown, errorCode: string | null,
 *        client: pg.PoolClient,
 *      ): Promise<void>
 *
 *        INSERT INTO sync_operations
 *          (client_op_id, device_id, user_id, op_type, payload_hash, status, result, error_code)
 *        VALUES ($1,...,$8)
 *        ON CONFLICT (client_op_id) DO NOTHING
 *
 *      `client` is REQUIRED, not optional. The ledger row and the actual write
 *      must land in the SAME transaction — see the note below.
 *
 *      Only APPLIED and REJECTED exist here; the CHECK constraint in
 *      009_sync.sql enforces that. DUPLICATE and CONFLICT are wire answers about
 *      a request, not stored states. A CONFLICT is stored as REJECTED with
 *      error_code = 'VERSION_CONFLICT'.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE LEDGER ROW AND THE WRITE SHARE A TRANSACTION
 *
 *   Ledger first, then write, separately: a crash between them leaves the op
 *   marked APPLIED with nothing written. The device sees DUPLICATE on retry,
 *   deletes its queue entry, and the visit is gone forever.
 *
 *   Write first, then ledger, separately: a crash between them means the retry
 *   applies the write twice.
 *
 *   Both inside one transaction: the pair is atomic, and neither failure exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON payload_hash
 *   It is not the idempotency key — client_op_id is. The hash detects a client
 *   bug where the SAME op id is reused with DIFFERENT content, which means the
 *   device's queue is corrupt. That must be REJECTED loudly, not silently
 *   deduplicated into the earlier payload.
 */

import type pg from "pg";
import { query } from "../../db/pool.ts";

export interface LedgerRow {
  payload_hash: string;
  status: string;
  result: unknown;
}

export async function findOperation(
  clientOpId: string,
  client?: pg.PoolClient,
): Promise<LedgerRow | null> {
  const sql = "SELECT payload_hash, status, result FROM sync_operations WHERE client_op_id = $1";
  const rows = client ? (await client.query<LedgerRow>(sql, [clientOpId])).rows : await query<LedgerRow>(sql, [clientOpId]);
  return rows[0] ?? null;
}

export async function recordOperation(
  clientOpId: string,
  deviceId: string,
  userId: string | null,
  opType: string,
  payloadHash: string,
  status: "APPLIED" | "REJECTED",
  result: unknown,
  errorCode: string | null,
  client: pg.PoolClient,
): Promise<void> {
  await client.query(
    `INSERT INTO sync_operations (client_op_id, device_id, user_id, op_type, payload_hash, status, result, error_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [clientOpId, deviceId, userId, opType, payloadHash, status, result, errorCode],
  );
}

/** Serialize even the first concurrent delivery, when there is no ledger row to lock. */
export async function lockOperation(id: string, client: pg.PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
}

export async function operationOwner(id: string, client: pg.PoolClient): Promise<{ user_id: string; device_id: string; op_type: string } | null> {
  return (await client.query<{ user_id: string; device_id: string; op_type: string }>(
    "SELECT user_id, device_id, op_type FROM sync_operations WHERE client_op_id=$1", [id],
  )).rows[0] ?? null;
}

export async function deviceBelongsTo(deviceId: string, userId: string): Promise<boolean> {
  // Older clients used a distinct sync device id. Bind it on first use, never steal it.
  return (await query(
    `INSERT INTO devices(device_id,user_id,platform,app_version)
     SELECT $1,u.user_id,'unknown','sync-v1' FROM users u WHERE u.user_id=$2 AND u.is_active
     ON CONFLICT(device_id) DO UPDATE SET last_seen_at=now()
     WHERE devices.user_id=EXCLUDED.user_id RETURNING device_id`, [deviceId,userId],
  )).length > 0;
}

export async function databaseTime(): Promise<string> {
  const rows = await query<{ time: string }>("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS time");
  return rows[0]!.time;
}

export interface ReferenceRow { stamp: string; key: string; kind: "facility" | "village" | "travel"; data: unknown; }

/** Villages have no update clock in the immutable v1 schema, so resend that small reference set. */
export async function referencePage(district: string, since: string | null, until: string, stamp: string | null, key: string | null, limit: number): Promise<ReferenceRow[]> {
  return query<ReferenceRow>(
    `WITH reference AS (
       SELECT f.updated_at AS ts, 'f:' || f.facility_id::text AS key, 'facility' AS kind,
         jsonb_build_object('facilityId',f.facility_id,'name',f.name,'facilityType',f.facility_type,
         'capabilityLevel',f.capability_level,'capabilityTags',f.capability_tags,'districtCode',f.district_code,
         'latitude',f.latitude,'longitude',f.longitude,'phone',f.phone,'lastConfirmedAt',f.last_confirmed_at,
         'lastNegativeAt',f.last_negative_at,'isDemoData',f.is_demo_data) AS data
       FROM facilities f WHERE f.district_code=$1 AND ($2::timestamptz IS NULL OR f.updated_at >= $2)
       UNION ALL
       SELECT '1970-01-01'::timestamptz, 'v:' || v.village_id::text, 'village',
         jsonb_build_object('villageId',v.village_id,'name',v.name,'districtCode',v.district_code,
         'latitude',ST_Y(v.centroid::geometry),'longitude',ST_X(v.centroid::geometry),'population',v.population)
       FROM villages v WHERE v.district_code=$1
       UNION ALL
       SELECT t.computed_at, 't:' || t.village_id::text || ':' || t.facility_id::text, 'travel',
         jsonb_build_object('villageId',t.village_id,'facilityId',t.facility_id,'travelSeconds',t.travel_seconds,
         'distanceMeters',t.distance_meters,'source',t.source)
       FROM travel_times t JOIN villages v USING(village_id) JOIN facilities f USING(facility_id)
       WHERE v.district_code=$1 AND f.district_code=$1 AND ($2::timestamptz IS NULL OR t.computed_at >= $2)
     ) SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS stamp, key, kind, data
       FROM reference WHERE ts <= $3::timestamptz AND ($4::timestamptz IS NULL OR (ts,key) > ($4::timestamptz,$5::text))
       ORDER BY ts,key LIMIT $6`,
    [district, since, until, stamp, key, limit],
  );
}
