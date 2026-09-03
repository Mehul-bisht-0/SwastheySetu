/**
 * FILE: packages/core/src/facilities/capability.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.6
 * STATUS: STUB — implement requiredCapability
 * PHASE: 2
 *
 * PURPOSE
 *   Translate a triage outcome into a HARD FILTER on facilities. This is the
 *   join between the decision engine and the routing engine — and it is the only
 *   place the two are allowed to touch. The decision engine does not know what a
 *   facility is; the routing engine does not know what a symptom is.
 *
 * WHY A HARD FILTER AND NOT A SCORE
 *   If capability were merely a scoring term, a very close sub-centre could
 *   outscore a slightly further hospital for an obstetric emergency. That is the
 *   exact failure this project exists to prevent. Capability is a gate.
 *
 * MAY IMPORT
 *   ./types.ts, ../triage/types.ts
 * MUST NOT IMPORT
 *   anything else — no npm packages, no node:* builtins
 *
 * DONE WHEN
 *   node --test "packages/core/src/facilities/capability.test.ts"  passes
 */

import type { Encounter, TriageResult, UrgencyTier } from "../triage/types.ts";
import type { CapabilityLevel, CapabilityRequirement } from "./types.ts";
import { mayBePregnant } from "../triage/predicate.ts";

export const CAP = {
  EMERGENCY_24X7: "EMERGENCY_24X7",
  DELIVERY: "DELIVERY",
  CAESAREAN: "CAESAREAN",
  NEWBORN_CARE: "NEWBORN_CARE",
  PAEDIATRIC: "PAEDIATRIC",
  INPATIENT: "INPATIENT",
  LAB_BASIC: "LAB_BASIC",
  PHARMACY: "PHARMACY",
  AMBULANCE: "AMBULANCE",
} as const;

export const MIN_LEVEL_BY_TIER: Record<UrgencyTier, CapabilityLevel> = {
  EMERGENCY: 3,
  GO_NOW: 2,
  PHC_SOON: 1,
  SELF_CARE: 1,
};

export function requiredCapability(
  encounter: Encounter,
  result: TriageResult,
): CapabilityRequirement {
  let minLevel: CapabilityLevel = MIN_LEVEL_BY_TIER[result.tier];
  const tags = new Set<string>();

  // EMERGENCY always needs 24-hour emergency capability
  if (result.tier === "EMERGENCY") tags.add(CAP.EMERGENCY_24X7);

  // Obstetric need — use the same safety convention as the rules
  if (mayBePregnant(encounter)) {
    tags.add(CAP.DELIVERY);
    if (result.tier === "EMERGENCY" || result.tier === "GO_NOW") {
      tags.add(CAP.CAESAREAN);
    }
  }

  // Paediatric need — age drives this
  const age = encounter.patient.ageMonths;
  if (age < 60) tags.add(CAP.PAEDIATRIC);
  if (age < 2)  tags.add(CAP.NEWBORN_CARE);

  // Floor bump for young infant emergency
  if (age < 2 && result.tier === "EMERGENCY") {
    minLevel = Math.max(minLevel, 3) as CapabilityLevel;
  }

  return { minLevel, requiredTags: [...tags].sort() };
}
