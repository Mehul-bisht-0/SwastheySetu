/**
 * FILE: packages/core/src/sync/opId.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.2
 * STATUS: STUB — implement canonicalize and isUuidV4
 * PHASE: 3
 *
 * PURPOSE
 *   Two helpers that make the idempotency ledger trustworthy.
 *
 *   canonicalize() produces a stable string for a payload so the server can
 *   hash it and detect the dangerous case: the SAME clientOpId arriving with a
 *   DIFFERENT payload. That means a client bug or a replay attack, and the
 *   server must reject it rather than pick a winner.
 *
 *   isUuidV4() rejects client-chosen ids that are not random. A device that
 *   sends "1", "2", "3" would collide with another device's ids and overwrite
 *   its records.
 *
 * MAY IMPORT
 *   nothing
 * MUST NOT IMPORT
 *   anything — this file is intentionally import-free so it runs on Hermes,
 *   in Node, and in a test with zero setup
 *
 * DONE WHEN
 *   node --test "packages/core/src/sync/opId.test.ts"  passes
 */

export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "null";
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    const entries = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]));
    return "{" + entries.join(",") + "}";
  }
  return "null";
}

export function payloadFingerprint(
  payload: unknown,
  hasher: (input: string) => string,
): string {
  return hasher(canonicalize(payload));
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): boolean {
  return typeof value === "string" && UUID_V4.test(value);
}
