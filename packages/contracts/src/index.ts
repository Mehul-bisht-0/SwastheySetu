/**
 * FILE: packages/contracts/src/index.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8
 * STATUS: COMPLETE — do not modify
 *
 * The wire format's public surface. apps/api and apps/mobile import from
 * "@swasthyasetu/contracts" and nowhere deeper.
 *
 * Namespaced re-exports rather than a flat dump: `triage.encounter` and
 * `asha.village` read unambiguously at the call site, and several names
 * (SymptomCode, SyncOpType) intentionally exist in both core and contracts —
 * the type and its validator. Flattening them would collide.
 */

export * as common from "./common.ts";
export * as auth from "./auth.ts";
export * as triage from "./triage.ts";
export * as facilities from "./facilities.ts";
export * as asha from "./asha.ts";
export * as sync from "./sync.ts";
export * as rag from "./rag.ts";
export * as patients from "./patients.ts";

// Envelope helpers are used by every route and every client call, so they are
// also available unqualified.
export { okEnvelope, errEnvelope, envelope, apiError, errorCode, pageOf, pageQuery } from "./common.ts";
export type { ApiError, ApiResponse, ErrorCode, Ok, Err, PageQuery } from "./common.ts";
