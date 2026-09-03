/**
 * FILE: packages/core/src/facilities/rank.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.8
 * STATUS: STUB — implement rankFacilities
 * PHASE: 2
 *
 * PURPOSE
 *   Order candidate facilities. This is the ROUTING ENGINE. It answers "where
 *   should this person go?" and nothing else — it does not decide urgency (that
 *   was the decision engine) and it does not consult any model (that is the
 *   knowledge engine, which never touches this path).
 *
 * THE SHAPE OF THE ANSWER
 *   score = w.capability * capabilityScore
 *         + w.time       * timeScore
 *         + w.freshness  * freshnessConfidence
 *   with weights that shift by urgency: an EMERGENCY weights capability most, a
 *   PHC_SOON weights travel time most. A dying patient needs the right facility;
 *   a mild fever needs a near one.
 *
 * WHY LINEAR AND WHY NO MODEL
 *   Every number in a result can be traced to an input and shown on screen. A
 *   health worker can disagree with a ranking and see exactly why it happened.
 *   That is worth more here than accuracy from an opaque scorer.
 *
 * MAY IMPORT
 *   ./types.ts, ./freshness.ts, ../triage/types.ts
 * MUST NOT IMPORT
 *   anything else — no npm packages, no node:* builtins, no Date.now()
 *
 * DONE WHEN
 *   node --test "packages/core/src/facilities/rank.test.ts"  passes
 */

import type { UrgencyTier } from "../triage/types.ts";
import { assessFreshness, DEFAULT_FRESHNESS } from "./freshness.ts";
import type {
  CapabilityRequirement,
  FacilityCandidate,
  RankedFacility,
  RankingConfig,
  RankingOutcome,
} from "./types.ts";

export const DEFAULT_RANKING: RankingConfig = {
  weights: {
    EMERGENCY: { capability: 0.55, time: 0.25, freshness: 0.2 },
    GO_NOW:    { capability: 0.4,  time: 0.35, freshness: 0.25 },
    PHC_SOON:  { capability: 0.25, time: 0.45, freshness: 0.3 },
    SELF_CARE: { capability: 0.2,  time: 0.5,  freshness: 0.3 },
  },
  horizonMinutes: {
    EMERGENCY: 120,
    GO_NOW:    120,
    PHC_SOON:   90,
    SELF_CARE:  60,
  },
  freshness: DEFAULT_FRESHNESS,
  maxResults: 5,
  tagDropOrder: [
    "PHARMACY",
    "LAB_BASIC",
    "AMBULANCE",
    "INPATIENT",
    "PAEDIATRIC",
    "NEWBORN_CARE",
    "CAESAREAN",
    "DELIVERY",
    "EMERGENCY_24X7",
  ],
  minEmergencyLevel: 2,
};

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function meetsRequirement(c: FacilityCandidate, req: CapabilityRequirement): boolean {
  if (c.capabilityLevel < req.minLevel) return false;
  for (const tag of req.requiredTags) {
    if (!c.capabilityTags.includes(tag)) return false;
  }
  return true;
}

export function buildReasons(
  candidate: FacilityCandidate,
  ranked: Omit<RankedFacility, "reasons" | "rank">,
  requirement: CapabilityRequirement,
  unmetRequirements: string[],
): string[] {
  const reasons: string[] = [];

  // 1. Travel time
  const mins = Math.round(candidate.travelSeconds / 60);
  if (candidate.travelSource === "ESTIMATED") {
    reasons.push(`About ${mins} minutes away (estimated — not a road route)`);
  } else {
    reasons.push(`About ${mins} minutes away`);
  }

  // 2. Freshness copy verbatim
  reasons.push(ranked.freshness.copy);

  // 3. Required tags this facility has
  for (const tag of requirement.requiredTags) {
    if (candidate.capabilityTags.includes(tag)) {
      reasons.push(`Has ${humanTag(tag)}`);
    }
  }

  // 4. Tags that were dropped during fallback
  for (const tag of unmetRequirements) {
    if (!candidate.capabilityTags.includes(tag)) {
      reasons.push(`Does not have ${humanTag(tag)}`);
    }
  }

  // 5. If reported closed, call before travelling
  if (ranked.freshness.band === "REPORTED_CLOSED") {
    reasons.push("Call before travelling if you can.");
  }

  return reasons;
}

function humanTag(tag: string): string {
  const map: Record<string, string> = {
    EMERGENCY_24X7: "24-hour emergency care",
    DELIVERY:       "delivery services",
    CAESAREAN:      "caesarean surgery",
    NEWBORN_CARE:   "newborn care",
    PAEDIATRIC:     "children's care",
    INPATIENT:      "beds for admission",
    LAB_BASIC:      "basic lab tests",
    PHARMACY:       "a pharmacy",
    AMBULANCE:      "an ambulance",
  };
  return map[tag] ?? tag.toLowerCase().replace(/_/g, " ");
}

export function rankFacilities(
  candidates: FacilityCandidate[],
  requirement: CapabilityRequirement,
  tier: UrgencyTier,
  now: string,
  cfg: RankingConfig = DEFAULT_RANKING,
): RankingOutcome {
  // Work on a copy so inputs are never mutated
  const pool = [...candidates];
  const w = cfg.weights[tier];
  const horizonSecs = cfg.horizonMinutes[tier] * 60;
  const unmetRequirements: string[] = [];
  let fallbackApplied = false;
  let workingReq: CapabilityRequirement = { ...requirement, requiredTags: [...requirement.requiredTags] };

  // Step 1+2: filter with fallback ladder
  let filtered = pool.filter((c) => meetsRequirement(c, workingReq));

  if (filtered.length === 0) {
    fallbackApplied = true;

    // Drop tags one at a time in tagDropOrder
    const remaining = [...workingReq.requiredTags];
    for (const dropCandidate of cfg.tagDropOrder) {
      const idx = remaining.indexOf(dropCandidate);
      if (idx !== -1) {
        remaining.splice(idx, 1);
        unmetRequirements.push(dropCandidate);
        workingReq = { minLevel: workingReq.minLevel, requiredTags: remaining };
        filtered = pool.filter((c) => meetsRequirement(c, workingReq));
        if (filtered.length > 0) break;
      }
    }

    // If still empty, relax minLevel
    if (filtered.length === 0) {
      let level = workingReq.minLevel - 1;
      const floor = tier === "EMERGENCY" ? cfg.minEmergencyLevel : 1;
      while (level >= floor && filtered.length === 0) {
        workingReq = { minLevel: level as typeof workingReq.minLevel, requiredTags: workingReq.requiredTags };
        filtered = pool.filter((c) => meetsRequirement(c, workingReq));
        level--;
      }
    }

    if (filtered.length === 0) {
      return { results: [], fallbackApplied, unmetRequirements, requirement: workingReq };
    }
  }

  // Step 3: score each
  type Scored = { candidate: FacilityCandidate; score: number; breakdown: { capability: number; time: number; freshness: number }; freshness: ReturnType<typeof assessFreshness> };
  const scored: Scored[] = filtered.map((c) => {
    const capabilityScore = Math.min(1, c.capabilityLevel / 5);
    const timeScore = Math.max(0, 1 - c.travelSeconds / horizonSecs);
    const freshnessAssessment = assessFreshness(c.lastConfirmedAt, c.lastNegativeAt, now, cfg.freshness);
    const freshnessScore = freshnessAssessment.confidence;

    const bc = round4(w.capability * capabilityScore);
    const bt = round4(w.time       * timeScore);
    const bf = round4(w.freshness  * freshnessScore);
    const score = round4(bc + bt + bf);

    return { candidate: c, score, breakdown: { capability: bc, time: bt, freshness: bf }, freshness: freshnessAssessment };
  });

  // Step 4: sort descending; tie-break: freshness confidence desc, travelSeconds asc, facilityId asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.freshness.confidence !== a.freshness.confidence) return b.freshness.confidence - a.freshness.confidence;
    if (a.candidate.travelSeconds !== b.candidate.travelSeconds) return a.candidate.travelSeconds - b.candidate.travelSeconds;
    return a.candidate.facilityId < b.candidate.facilityId ? -1 : 1;
  });

  // Step 5: take maxResults and build reasons
  const top = scored.slice(0, cfg.maxResults);
  const results: RankedFacility[] = top.map((s, i) => {
    const partial: Omit<RankedFacility, "reasons" | "rank"> = {
      facility: s.candidate,
      score: s.score,
      breakdown: s.breakdown,
      freshness: s.freshness,
      travelEstimated: s.candidate.travelSource === "ESTIMATED",
    };
    const reasons = buildReasons(s.candidate, partial, workingReq, unmetRequirements);
    return { ...partial, reasons, rank: i + 1 };
  });

  return { results, fallbackApplied, unmetRequirements, requirement: workingReq };
}
