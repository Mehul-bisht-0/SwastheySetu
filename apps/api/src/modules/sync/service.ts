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

import type { sync as syncContracts } from "@swasthyasetu/contracts";
import { assertNever, payloadFingerprint } from "@swasthyasetu/core";

import { findOperation, recordOperation } from "./repo.ts";
import { withTransaction } from "../../db/tx.ts";
import { sha256 } from "../../util/hash.ts";

type PushRequest = ReturnType<typeof syncContracts.pushRequest.parse>;
type PushResponse = ReturnType<typeof syncContracts.pushResponse.parse>;
type PullQuery = ReturnType<typeof syncContracts.pullQuery.parse>;
type PullResponse = ReturnType<typeof syncContracts.pullResponse.parse>;

export async function push(input: PushRequest, userId: string): Promise<PushResponse> {
  throw new Error("NOT_IMPLEMENTED: push — see doc comment");
}

export async function pull(q: PullQuery, districtCode: string): Promise<PullResponse> {
  throw new Error("NOT_IMPLEMENTED: pull — see doc comment");
}
