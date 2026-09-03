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
  throw new Error("NOT_IMPLEMENTED: findOperation — see doc comment step 1");
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
  throw new Error("NOT_IMPLEMENTED: recordOperation — see doc comment step 2");
}
