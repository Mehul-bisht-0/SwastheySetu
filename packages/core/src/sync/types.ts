/**
 * FILE: packages/core/src/sync/types.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.1
 * STATUS: COMPLETE — do not modify
 *
 * The offline write queue's vocabulary. Lives in core (not in the mobile app)
 * because the API validates against exactly the same shapes.
 */

/**
 * Every offline-capable write is one of these. Add a new type here first, then
 * add its handler on the server — an unknown opType must be rejected, never
 * silently dropped, or a health worker's visit disappears without a trace.
 */
export type SyncOpType =
  | "TRIAGE_REPORT_CREATE"
  | "HOUSEHOLD_VISIT_UPSERT"
  | "FACILITY_SIGNAL_CREATE";

export interface SyncOperation<T = unknown> {
  /**
   * UUID v4 generated ON THE DEVICE, before the first send attempt, and reused
   * for every retry. This is what makes sync idempotent: the server stores it in
   * sync_operations and replays the stored result instead of applying the write
   * twice. A device that generates a new id per retry will create duplicates.
   */
  clientOpId: string;
  opType: SyncOpType;
  /** Device clock, ISO 8601. Advisory only — the server never trusts it for ordering. */
  clientCreatedAt: string;
  /** For last-write-wins entities. Increment locally on each edit. */
  entityVersion?: number;
  payload: T;
}

export type SyncOpStatus = "APPLIED" | "DUPLICATE" | "CONFLICT" | "REJECTED";

export interface SyncOpResult {
  clientOpId: string;
  status: SyncOpStatus;
  /** Server-assigned id of the created/updated row, when there is one. */
  serverId?: string;
  /** Present only when status is CONFLICT or REJECTED. Shown to the user. */
  message?: string;
}

/** Injected so core stays dependency-free; the API passes a SHA-256, the app a JS impl. */
export type Hasher = (input: string) => string;
