/**
 * FILE: packages/core/src/util/clock.ts
 * PLAN: IMPLEMENTATION_PLAN.md 6, 6.8
 * STATUS: COMPLETE - do not modify
 *
 * Why this exists: nothing in core may call Date.now() directly. Time is passed
 * in, which is what makes every scenario fixture reproducible and every
 * freshness test deterministic.
 */

export interface Clock {
  now(): Date;
}

/** Production clock. The only place in core allowed to touch real time. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test clock pinned to a fixed instant. */
export function fixedClock(iso: string): Clock {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`fixedClock: invalid ISO timestamp "${iso}"`);
  }
  return { now: () => new Date(at.getTime()) };
}

/** Whole days between two instants, positive when `later` is after `earlier`. */
export function daysBetween(earlier: Date, later: Date): number {
  const MS_PER_DAY = 86_400_000;
  return (later.getTime() - earlier.getTime()) / MS_PER_DAY;
}
