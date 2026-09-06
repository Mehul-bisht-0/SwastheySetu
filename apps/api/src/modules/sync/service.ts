/**
 * FILE: apps/api/src/modules/sync/service.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.3, §10.4
 * STATUS: STUB — implement push and pull
 * PHASE: 9
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ONE RULE: A QUEUED WRITE IS NEVER LOST AND NEVER APPLIED TWICE.
 *
 *  An ASHA walks for a day, records eleven household visits and four facility
 *  signals, and reaches a signal bar in the evening. Everything she recorded
 *  must land exactly once, even if the connection drops mid-batch, even if the
 *  response never reaches her phone, even if she retries four times.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT — push
 *
 *   export async function push(
 *     input: PushRequest, userId: string
 *   ): Promise<PushResponse>
 *
 *   Loop over input.operations. FOR EACH ONE, INDEPENDENTLY:
 *
 *     const hash = payloadFingerprint(op.payload, sha256);
 *
 *     a. const prior = await findOperation(op.clientOpId);
 *        if (prior) {
 *          if (prior.payload_hash !== hash) {
 *            // Same op id, different content: the device's queue is corrupt.
 *            // Reject loudly. Deduplicating here would silently discard the
 *            // second, different write.
 *            push REJECTED with message "Operation id reused with different data."
 *          } else {
 *            // The normal lost-response case. Replay the stored result verbatim.
 *            push { status: "DUPLICATE", serverId: prior.result.serverId }
 *          }
 *          continue;
 *        }
 *
 *     b. await withTransaction(async (client) => {
 *          switch (op.opType) {
 *            case "TRIAGE_REPORT_CREATE":
 *              re-evaluate server-side, insertReport(..., client)
 *            case "HOUSEHOLD_VISIT_UPSERT":
 *              upsertVisit(op.payload, userId, client)
 *              null return  -> VERSION_CONFLICT (see below)
 *            case "FACILITY_SIGNAL_CREATE":
 *              insertSignal(op.payload, userId, client)
 *            default:
 *              assertNever(op) — an unknown opType is REJECTED, never ignored.
 *              A silently dropped op is a health worker's day of work vanishing
 *              with no error anywhere.
 *          }
 *          await recordOperation(..., client);   // SAME transaction. Always.
 *        });
 *
 *     c. Catch per operation. One failure must not abort the other 99 — see the
 *        note at the top of packages/contracts/src/sync.ts. Map the error:
 *          VERSION_CONFLICT   -> status CONFLICT   (client keeps its copy,
 *                                                   surfaces it, does NOT retry
 *                                                   unchanged)
 *          ZodError / 4xx     -> status REJECTED   (permanently invalid; the
 *                                                   client must not retry, but
 *                                                   must not delete it silently
 *                                                   either — dead-letter it)
 *          anything else      -> RETHROW.
 *                                A transient database error must NOT be recorded
 *                                as REJECTED: that is permanent, and the device
 *                                would drop a perfectly good write. Let the
 *                                whole request 500 so the device retries the
 *                                batch — which is safe, because idempotency
 *                                makes a retry free.
 *
 *   Return one result per operation, in the same order, plus serverTime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT — pull
 *
 *   export async function pull(q: PullQuery, districtCode: string): Promise<PullResponse>
 *
 *     Page facilities, villages and travel_times with the tuple cursor
 *     (see `cursor` in packages/contracts/src/common.ts).
 *
 *     Scope to districtCode FROM THE TOKEN. A national pull would be hundreds of
 *     megabytes and would never complete on a 2G link — and the device does not
 *     need it.
 *
 *     serverTime MUST come from the database (SELECT now()), not from
 *     new Date(). The device stores it and sends it back as `since`; if it came
 *     from the API process while the DB clock differed, rows written in the gap
 *     would be skipped permanently and the phone would silently miss facilities.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER PULL PATIENT DATA
 *   Facilities, villages and travel times only. Triage reports and household
 *   visits go UP, never down. A stolen phone must not be able to re-download a
 *   village's health records.
 */

import { sync as syncContracts } from "@swasthyasetu/contracts";
import { assertNever, payloadFingerprint } from "@swasthyasetu/core";
import { z } from "zod";

import { findOperation, recordOperation, lockOperation, operationOwner, deviceBelongsTo, databaseTime, referencePage } from "./repo.ts";
import { withTransaction } from "../../db/tx.ts";
import { sha256 } from "../../util/hash.ts";
import { evaluate } from "../triage/service.ts";
import { insertReport } from "../triage/repo.ts";
import { upsertVisit } from "../asha/repo.ts";
import { insertSignal } from "../facilities/repo.ts";
import { validateSignal } from "../facilities/service.ts";
import { badRequest, forbidden } from "../../plugins/errors.ts";

type PushRequest = ReturnType<typeof syncContracts.pushRequest.parse>;
type PushResponse = ReturnType<typeof syncContracts.pushResponse.parse>;
type PullQuery = ReturnType<typeof syncContracts.pullQuery.parse>;
type PullResponse = ReturnType<typeof syncContracts.pullResponse.parse>;

export async function push(input: PushRequest, userId: string): Promise<PushResponse> {
  const results: PushResponse["results"] = [];
  for (const op of input.operations) {
    const hash = payloadFingerprint(op.payload, sha256);
    const result = await withTransaction(async (client): Promise<PushResponse["results"][number]> => {
      await lockOperation(op.clientOpId, client);
      const prior = await findOperation(op.clientOpId, client);
      if (prior) {
        const owner = await operationOwner(op.clientOpId, client);
        if (owner?.user_id !== userId || owner.device_id !== input.deviceId || owner.op_type !== op.opType || prior.payload_hash !== hash) {
          return { clientOpId: op.clientOpId, status: "REJECTED", message: "Operation id reused with different data." };
        }
        const stored = syncContracts.syncOpResult.parse(prior.result);
        return { ...stored, status: prior.status === "APPLIED" ? "DUPLICATE" : stored.status };
      }
      let outcome: PushResponse["results"][number];
      // A savepoint allows permanent failures to be recorded without committing partial writes.
      await client.query("SAVEPOINT apply_operation");
      try {
        switch (op.opType) {
          case "TRIAGE_REPORT_CREATE": {
            const serverResult = evaluate(op.payload.encounter);
            await insertReport({ ...op.payload, deviceId: input.deviceId }, serverResult, client);
            outcome = { clientOpId: op.clientOpId, status: "APPLIED", serverId: op.payload.reportId };
            break;
          }
          case "HOUSEHOLD_VISIT_UPSERT": {
            if (op.entityVersion !== op.payload.entityVersion) throw badRequest("Visit versions do not match.");
            const saved = await upsertVisit({ ...op.payload, deviceId: input.deviceId }, userId, client);
            outcome = saved
              ? { clientOpId: op.clientOpId, status: "APPLIED", serverId: op.payload.visitId }
              : { clientOpId: op.clientOpId, status: "CONFLICT", message: "This visit has a newer version or a different owner." };
            break;
          }
          case "FACILITY_SIGNAL_CREATE":
            await validateSignal(op.payload, userId);
            await insertSignal({ ...op.payload, deviceId: input.deviceId }, userId, client);
            outcome = { clientOpId: op.clientOpId, status: "APPLIED", serverId: op.payload.activityId };
            break;
          default: return assertNever(op);
        }
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
        if (!["23503", "23514", "23505", "VALIDATION_FAILED", "FORBIDDEN", "NOT_FOUND"].includes(String(code))) throw error;
        await client.query("ROLLBACK TO SAVEPOINT apply_operation");
        outcome = { clientOpId: op.clientOpId, status: "REJECTED", message: "The operation failed validation or refers to an inaccessible record." };
      }
      await recordOperation(op.clientOpId, input.deviceId, userId, op.opType, hash,
        outcome.status === "APPLIED" ? "APPLIED" : "REJECTED", outcome,
        outcome.status === "CONFLICT" ? "VERSION_CONFLICT" : null, client);
      return outcome;
    });
    results.push(result);
  }
  return { results, serverTime: await databaseTime() };
}

/** Validate the transport once, and each payload independently: one bad op must not poison a batch. */
export async function pushBatch(body: unknown, userId: string, _deviceId: string): Promise<PushResponse> {
  const batch = syncContracts.pushRequest.extend({ operations: z.array(z.unknown()).min(1).max(100) }).parse(body);
  if (!(await deviceBelongsTo(batch.deviceId, userId))) throw forbidden();
  const results: PushResponse["results"] = [];
  for (const raw of batch.operations) z.object({ clientOpId: z.string().uuid() }).parse(raw);
  for (const raw of batch.operations) {
    const identity = z.object({ clientOpId: z.string().uuid() }).parse(raw);
    const parsed = syncContracts.syncOperation.safeParse(raw);
    if (!parsed.success) {
      results.push({ clientOpId: identity.clientOpId, status: "REJECTED", message: "Invalid operation payload." });
      continue;
    }
    const response = await push({ deviceId: batch.deviceId, operations: [parsed.data] }, userId);
    results.push(...response.results);
  }
  return { results, serverTime: await databaseTime() };
}

export async function pull(q: PullQuery, districtCode: string): Promise<PullResponse> {
  const cursorSchema = z.object({ until: z.string().datetime({ offset: true }), stamp: z.string().datetime({ offset: true }), key: z.string().max(100), district: z.string(), since: z.string().nullable() });
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (q.cursor) {
    try {
      if (q.cursor.length > 2048) throw new Error();
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")));
      if (cursor.district !== districtCode || cursor.since !== (q.since ?? null)) throw new Error();
    } catch { throw badRequest("Invalid reference-data cursor."); }
  }
  const until = cursor?.until ?? await databaseTime();
  const rows = await referencePage(districtCode, q.since ?? null, until, cursor?.stamp ?? null, cursor?.key ?? null, q.limit + 1);
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const nextCursor = rows.length > q.limit && last
    ? Buffer.from(JSON.stringify({ until, stamp: last.stamp, key: last.key, district: districtCode, since: q.since ?? null })).toString("base64url") : null;
  return syncContracts.pullResponse.parse({
    facilities: { items: page.filter(r => r.kind === "facility").map(r => r.data), nextCursor },
    villages: { items: page.filter(r => r.kind === "village").map(r => r.data), nextCursor },
    travelTimes: { items: page.filter(r => r.kind === "travel").map(r => r.data), nextCursor },
    serverTime: until,
  });
}
