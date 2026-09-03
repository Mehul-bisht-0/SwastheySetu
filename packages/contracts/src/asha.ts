/**
 * FILE: packages/contracts/src/asha.ts
 * PLAN: IMPLEMENTATION_PLAN.md §8.5
 * STATUS: COMPLETE — do not modify
 *
 * The health worker's own workflow: household visits and her assigned villages.
 *
 * PRIVACY SHAPE — READ BEFORE ADDING A FIELD
 *   `householdCode` is the code from her paper register. There is no name field,
 *   no phone field, no aadhaar field, and none may be added. A prototype that
 *   syncs identified household health data to a hackathon server is a liability,
 *   and the demo does not need it to be convincing.
 */

import { z } from "zod";
import { isoDateTime, uuid } from "./common.ts";
import { symptomCode } from "./triage.ts";

export const village = z.object({
  villageId: uuid,
  name: z.string(),
  districtCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  population: z.number().int().nullable(),
});
export type Village = z.infer<typeof village>;

/** GET /asha/villages — the ASHA's assigned area, cached on the device for offline use. */
export const villagesResponse = z.object({ items: z.array(village) });
export type VillagesResponse = z.infer<typeof villagesResponse>;

// ------------------------------------------------------------ household visits

export const householdVisit = z.object({
  visitId: uuid,
  villageId: uuid,
  /** Register code, e.g. "HH-014". NOT a person's name. See the note at the top. */
  householdCode: z.string().min(1).max(64),
  visitedAt: isoDateTime,
  membersSeen: z.number().int().min(0).max(50),
  /** Danger signs observed across the household, drawn from the triage vocabulary. */
  dangerSigns: z.array(symptomCode).default([]),
  referralMade: z.boolean().default(false),
  /** Free-form structured findings. Kept open so the form can evolve mid-hackathon. */
  findings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  notes: z.string().max(2000).optional(),
  /**
   * Last-write-wins guard. The device increments this on every local edit and
   * sends it back; the server rejects a write whose version is behind with
   * VERSION_CONFLICT rather than silently overwriting a newer record.
   */
  entityVersion: z.number().int().min(1).default(1),
  createdAt: isoDateTime,
});
export type HouseholdVisit = z.infer<typeof householdVisit>;

/**
 * Upsert, not create-then-update.
 *
 * A device offline for a week may create a visit, edit it twice, and only then
 * reach the network. Forcing it to replay that as CREATE + UPDATE + UPDATE means
 * three chances to fail halfway; one idempotent upsert of the final state means
 * none.
 */
export const upsertVisitRequest = householdVisit.extend({
  deviceId: z.string().optional(),
});
export type UpsertVisitRequest = z.infer<typeof upsertVisitRequest>;

export const upsertVisitResponse = z.object({
  visitId: uuid,
  entityVersion: z.number().int(),
  /** true = row inserted, false = existing row updated. */
  created: z.boolean(),
});
export type UpsertVisitResponse = z.infer<typeof upsertVisitResponse>;

/** GET /asha/visits — her own recent visits, newest first. */
export const listVisitsQuery = z.object({
  villageId: uuid.optional(),
  since: isoDateTime.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListVisitsQuery = z.infer<typeof listVisitsQuery>;

export const listVisitsResponse = z.object({ items: z.array(householdVisit) });
export type ListVisitsResponse = z.infer<typeof listVisitsResponse>;
