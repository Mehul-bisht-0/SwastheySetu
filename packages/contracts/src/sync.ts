/**
 * FILE: packages/contracts/src/sync.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.6, §10
 * STATUS: COMPLETE — do not modify
 *
 * The offline protocol. Two endpoints, in this order of importance:
 *
 *   POST /sync/push  — the device's queued writes go up. MUST NOT LOSE DATA.
 *   GET  /sync/pull  — reference data comes down. May be retried freely.
 *
 * WHY PUSH IS A BATCH OF INDEPENDENT OPERATIONS AND NOT A TRANSACTION
 *   If one queued visit is malformed — a stale app version, a corrupted row —
 *   an all-or-nothing batch would reject the other nineteen with it, and the
 *   device would retry the same doomed batch forever. Each operation therefore
 *   succeeds or fails alone, and the response reports on every one of them by
 *   clientOpId. A partial success is the normal case, not an error case.
 */

import { z } from "zod";
import { deviceId, isoDateTime, pageOf, uuid } from "./common.ts";
import { createSignalRequest, facility } from "./facilities.ts";
import { upsertVisitRequest, village } from "./asha.ts";
import { createReportRequest } from "./triage.ts";

/** MIRRORS SyncOpType in packages/core/src/sync/types.ts and the CHECK in 009_sync.sql. */
export const syncOpType = z.enum([
  "TRIAGE_REPORT_CREATE",
  "HOUSEHOLD_VISIT_UPSERT",
  "FACILITY_SIGNAL_CREATE",
]);
export type SyncOpType = z.infer<typeof syncOpType>;

/**
 * Discriminated on opType so the payload is validated against the right schema
 * automatically. Add a new op by adding a member here AND to syncOpType AND to
 * the CHECK constraint in 009_sync.sql — all three, same commit.
 */
export const syncOperation = z.discriminatedUnion("opType", [
  z.object({
    clientOpId: uuid,
    opType: z.literal("TRIAGE_REPORT_CREATE"),
    clientCreatedAt: isoDateTime,
    payload: createReportRequest,
  }),
  z.object({
    clientOpId: uuid,
    opType: z.literal("HOUSEHOLD_VISIT_UPSERT"),
    clientCreatedAt: isoDateTime,
    entityVersion: z.number().int().min(1),
    payload: upsertVisitRequest,
  }),
  z.object({
    clientOpId: uuid,
    opType: z.literal("FACILITY_SIGNAL_CREATE"),
    clientCreatedAt: isoDateTime,
    payload: createSignalRequest,
  }),
]);
export type SyncOperation = z.infer<typeof syncOperation>;

export const pushRequest = z.object({
  deviceId,
  /**
   * Capped at 100. A device offline for a month must send several batches
   * rather than one request that times out on a 2G link and is retried whole.
   */
  operations: z.array(syncOperation).min(1).max(100),
});
export type PushRequest = z.infer<typeof pushRequest>;

/**
 * Per-operation outcome. Four states, and the difference between them matters
 * to the client:
 *
 *   APPLIED   — written. Delete from the local queue.
 *   DUPLICATE — this clientOpId was already processed; `serverId` is replayed
 *               from the ledger. Also delete from the queue: the work is done.
 *               This is the normal answer when a previous response was lost,
 *               and it is a SUCCESS, not an error.
 *   CONFLICT  — a stale entityVersion lost a last-write-wins race. Keep the
 *               local row, surface it for the user to reconcile. Do NOT retry
 *               unchanged: it will conflict again forever.
 *   REJECTED  — permanently invalid. Retrying cannot help. Move it to a dead
 *               letter list and show it; never drop it silently.
 */
export const syncOpResult = z.object({
  clientOpId: uuid,
  status: z.enum(["APPLIED", "DUPLICATE", "CONFLICT", "REJECTED"]),
  serverId: z.string().optional(),
  message: z.string().optional(),
});
export type SyncOpResult = z.infer<typeof syncOpResult>;

export const pushResponse = z.object({
  /** One entry per submitted operation, same order. The client matches on clientOpId. */
  results: z.array(syncOpResult),
  serverTime: isoDateTime,
});
export type PushResponse = z.infer<typeof pushResponse>;

// ------------------------------------------------------------ pull

/**
 * Reference data down: facilities, villages, and the freshness timestamps that
 * make offline ranking possible.
 *
 * The cursor is a (updated_at, id) tuple, not an offset — see `cursor` in
 * common.ts for why, and facilities_pull_cursor in 004_facilities.sql for the
 * index that makes it fast.
 */
export const pullQuery = z.object({
  /** Omit on first sync to get everything. */
  since: isoDateTime.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  districtCode: z.string().optional(),
});
export type PullQuery = z.infer<typeof pullQuery>;

/**
 * Travel times ship to the device so ranking works with no network at all. This
 * is the row count that decides whether offline routing is viable, so keep the
 * pull district-scoped — a national table would never fit on the phone.
 */
export const travelTime = z.object({
  villageId: uuid,
  facilityId: uuid,
  travelSeconds: z.number().int().min(0),
  distanceMeters: z.number().int().min(0),
  source: z.enum(["OSRM", "ESTIMATED"]),
});
export type TravelTime = z.infer<typeof travelTime>;

export const pullResponse = z.object({
  facilities: pageOf(facility),
  villages: pageOf(village),
  travelTimes: pageOf(travelTime),
  /**
   * The device stores this and sends it as `since` next time. Use the SERVER's
   * clock, never the device's — a phone with a wrong clock would otherwise skip
   * rows permanently.
   */
  serverTime: isoDateTime,
});
export type PullResponse = z.infer<typeof pullResponse>;
