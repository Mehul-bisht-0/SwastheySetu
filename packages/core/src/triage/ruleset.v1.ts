/**
 * FILE: packages/core/src/triage/ruleset.v1.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.3
 * STATUS: COMPLETE — do not modify
 * PHASE: 1
 *
 * The red-flag ruleset. This file is DATA, deliberately pre-written: it is the
 * safety layer, and it is exactly the kind of table that is easy to get subtly
 * wrong. Treat it as the specification.
 *
 * PROVENANCE
 *   Derived from widely published IMNCI / WHO danger-sign lists.
 *   NOT CLINICALLY VALIDATED. No clinician has reviewed this ruleset.
 *   Record every future change and its source in docs/SAFETY.md.
 *
 * CHANGING A RULE
 *   Ruleset versions are pinned into every stored triage_report. Never edit a
 *   released rule in place — add rules and bump RULESET_VERSION, so an old
 *   stored result stays interpretable. A change that alters an existing outcome
 *   must break a scenario fixture in tests/scenarios/. That is the point.
 *
 * ADVICE COPY RULES
 *   Advice strings are ACTIONS, never diagnoses. Never name a disease.
 *   Short sentences, no jargon, written to be read by a frightened parent.
 */

import type { RedFlagRule } from "./redFlags.ts";

export const RULESET_VERSION = "redflags-v1.0.0";

/** 5 years, in months — the paediatric threshold used throughout. */
const CHILD_UNDER_5 = 60;
/** 2 months — young infant threshold. */
const YOUNG_INFANT = 2;
/** 35 years, in months. */
const ADULT_35 = 420;

export const RULES: readonly RedFlagRule[] = [
  {
    id: "RF_UNCONSCIOUS",
    tier: "EMERGENCY",
    label: "The person cannot be woken up",
    advice: [
      "Go to the nearest hospital now.",
      "Do not wait for morning.",
      "Lay the person on their side while travelling.",
    ],
    when: { op: "hasSymptom", code: "UNCONSCIOUS" },
  },
  {
    id: "RF_CONVULSION",
    tier: "EMERGENCY",
    label: "There have been fits or convulsions",
    advice: [
      "Go to the nearest hospital now.",
      "Do not put anything in the mouth.",
      "Lay the person on their side and keep them safe from injury.",
    ],
    when: { op: "hasSymptom", code: "CONVULSION" },
  },
  {
    id: "RF_INFANT_FEVER",
    tier: "EMERGENCY",
    label: "A baby under 2 months has a fever",
    advice: [
      "Take the baby to a facility that can treat newborns now.",
      "Keep the baby warm and keep feeding if the baby will feed.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "FEVER" },
        { op: "ageMonthsLt", value: YOUNG_INFANT },
      ],
    },
  },
  {
    id: "RF_CHILD_NOT_FEEDING",
    tier: "EMERGENCY",
    label: "A young child is not feeding or drinking",
    advice: [
      "Go to a facility that can treat children now.",
      "Keep offering small sips on the way.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "NOT_FEEDING" },
        { op: "ageMonthsLt", value: CHILD_UNDER_5 },
      ],
    },
  },
  {
    id: "RF_CHILD_FAST_BREATHING",
    tier: "EMERGENCY",
    label: "A young child is breathing fast or struggling to breathe",
    advice: [
      "Go to a facility that can treat children now.",
      "Keep the child upright and calm while travelling.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "FAST_BREATHING" },
        { op: "ageMonthsLt", value: CHILD_UNDER_5 },
      ],
    },
  },
  {
    id: "RF_UNABLE_TO_DRINK",
    tier: "EMERGENCY",
    label: "The person cannot drink anything at all",
    advice: [
      "Go to the nearest facility now.",
      "Keep offering small sips of clean water or ORS on the way.",
    ],
    when: { op: "answerEquals", questionId: "DRINKING", value: "unable" },
  },
  {
    id: "RF_PREG_BLEEDING",
    tier: "EMERGENCY",
    label: "Heavy bleeding during pregnancy",
    advice: [
      "Go to a facility that can handle delivery emergencies now.",
      "Arrange transport immediately — do not travel alone.",
    ],
    when: {
      op: "all",
      of: [{ op: "mayBePregnant" }, { op: "hasSymptom", code: "BLEEDING_HEAVY" }],
    },
  },
  {
    id: "RF_PREG_SEVERE_HEADACHE_VISION",
    tier: "EMERGENCY",
    label: "Warning signs in pregnancy: swelling, blurred vision or a severe headache",
    advice: [
      "Go to a facility that can handle delivery emergencies now.",
      "These signs can become serious quickly. Do not wait.",
    ],
    when: {
      op: "all",
      of: [
        { op: "mayBePregnant" },
        {
          op: "any",
          of: [
            { op: "hasSymptom", code: "SWELLING_FACE_HANDS" },
            { op: "hasSymptom", code: "BLURRED_VISION" },
            { op: "answerEquals", questionId: "HEADACHE_SEVERE", value: true },
          ],
        },
      ],
    },
  },
  {
    id: "RF_STROKE_SIGNS",
    tier: "EMERGENCY",
    label: "Sudden weakness on one side, or sudden difficulty speaking",
    advice: [
      "Go to the largest hospital you can reach now.",
      "Note the time the signs started and tell the staff.",
    ],
    when: {
      op: "hasAnySymptom",
      codes: ["WEAKNESS_ONE_SIDE", "DIFFICULTY_SPEAKING"],
    },
  },
  {
    id: "RF_CHEST_PAIN_ADULT",
    tier: "EMERGENCY",
    label: "Chest pain in an adult",
    advice: [
      "Go to a hospital with emergency care now.",
      "Do not walk or drive yourself — arrange transport.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "CHEST_PAIN" },
        { op: "ageMonthsGte", value: ADULT_35 },
      ],
    },
  },
  {
    id: "RF_HEAVY_BLEEDING_ANY",
    tier: "EMERGENCY",
    label: "Heavy bleeding that will not stop",
    advice: [
      "Go to the nearest facility now.",
      "Press firmly on the bleeding point with a clean cloth while travelling.",
    ],
    when: { op: "hasSymptom", code: "BLEEDING_HEAVY" },
  },
  {
    id: "RF_REDUCED_FETAL_MOVEMENT",
    tier: "GO_NOW",
    label: "The baby is moving less than usual",
    advice: [
      "Get checked today at a facility that handles deliveries.",
      "Do not wait until your next scheduled visit.",
    ],
    when: {
      op: "all",
      of: [
        { op: "mayBePregnant" },
        { op: "hasSymptom", code: "REDUCED_FETAL_MOVEMENT" },
      ],
    },
  },
  {
    id: "RF_BLOODY_DIARRHOEA_CHILD",
    tier: "GO_NOW",
    label: "A young child has blood in the stool",
    advice: [
      "Take the child to a facility today.",
      "Keep giving ORS in small frequent sips.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "DIARRHOEA" },
        { op: "answerEquals", questionId: "BLOOD_IN_STOOL", value: true },
        { op: "ageMonthsLt", value: CHILD_UNDER_5 },
      ],
    },
  },
  {
    id: "RF_PERSISTENT_VOMIT_CHILD",
    tier: "GO_NOW",
    label: "A young child vomits everything and keeps nothing down",
    advice: [
      "Take the child to a facility today.",
      "Offer small sips of ORS every few minutes on the way.",
    ],
    when: {
      op: "all",
      of: [
        { op: "hasSymptom", code: "VOMITING" },
        { op: "answerEquals", questionId: "KEEPS_NOTHING_DOWN", value: true },
        { op: "ageMonthsLt", value: CHILD_UNDER_5 },
      ],
    },
  },
];

/**
 * NOTE ON OVERLAP
 *   RF_HEAVY_BLEEDING_ANY and RF_PREG_BLEEDING both fire for a pregnant woman
 *   with heavy bleeding. That is intentional: the engine collects ALL hits, so
 *   the obstetric-specific advice appears alongside the general advice, and the
 *   most severe tier wins. Overlapping rules are fine. Missing rules are not.
 *
 * NOTE ON TIERS
 *   The brief said "red flag -> EMERGENCY". Allowing a rule to declare GO_NOW is
 *   a strict superset: the engine takes the maximum severity across hits and the
 *   classifier can never lower a red-flag tier. For literal parity with the
 *   brief, set every `tier` above to "EMERGENCY" — nothing else changes.
 */
