/**
 * FILE: packages/core/src/util/result.ts
 * PLAN: IMPLEMENTATION_PLAN.md 6
 * STATUS: COMPLETE - do not modify
 *
 * Core does not throw for expected outcomes. An expected failure is a value the
 * caller must handle, not an exception it can forget to catch.
 * (Throwing IS correct for programmer errors - an unreachable switch branch,
 * an invalid ISO string - because those are bugs, not outcomes.)
 */

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

/** Exhaustiveness helper: makes a missed union branch a COMPILE error. */
export function assertNever(x: never, context = "unexpected variant"): never {
  throw new Error(`${context}: ${JSON.stringify(x)}`);
}

/** Clamp into [lo, hi]. Used by scoring; kept here so it is tested once. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
