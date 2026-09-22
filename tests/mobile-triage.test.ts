import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRedFlags, mostSevereTier, RULES } from "@swasthyasetu/core";
import type { PatientContext } from "@swasthyasetu/core";
import {
  buildEncounter,
  decodeMulti,
  encodeMulti,
  extractIntakeAnswers,
  INTAKE_VERSION,
  localizeOption,
  localizeQuestion,
  pruneAfter,
  QUESTION_COUNT,
  QUESTION_IDS,
  questionAt,
  reportedLocation,
  shouldEndIntakeForRedFlag,
} from "../apps/mobile/src/ivr/questionnaire.ts";

const adult: PatientContext = { ageMonths: 360, sex: "male", pregnancy: "no" };

test("the normal intake has exactly 15 stable question positions", () => {
  assert.equal(QUESTION_COUNT, 15);
  assert.equal(QUESTION_IDS.length, 15);
  for (let number = 1; number <= QUESTION_COUNT; number += 1) {
    assert.equal(questionAt(number, adult, {}).number, number);
    assert.equal(questionAt(number, adult, {}).id, QUESTION_IDS[number - 1]);
  }
});

test("specific body options are generated from the selected broad region", () => {
  const head = questionAt(7, adult, { BODY_REGION: "head_face" });
  const leg = questionAt(7, adult, { BODY_REGION: "leg_foot" });
  assert.ok(head.options?.some((option) => option.value === "eye"));
  assert.ok(head.options?.some((option) => option.value === "ear"));
  assert.ok(leg.options?.some((option) => option.value === "knee"));
  assert.equal(leg.options?.some((option) => option.value === "eye"), false);
});

test("multi-select encoding is stable, unique, and reversible", () => {
  const encoded = encodeMulti(["vomiting", "fever", "vomiting"]);
  assert.equal(encoded, "fever|vomiting");
  assert.deepEqual(decodeMulti(encoded), ["fever", "vomiting"]);
});

test("explicit immediate danger signs map to the existing red-flag vocabulary", () => {
  const encounter = buildEncounter(adult, {
    PRIMARY_CONCERN: "other",
    IMMEDIATE_DANGER_SIGNS: encodeMulti(["unconscious", "heavy_bleeding"]),
  });
  assert.ok(encounter.symptoms.includes("UNCONSCIOUS"));
  assert.ok(encounter.symptoms.includes("BLEEDING_HEAVY"));
  const hits = evaluateRedFlags(encounter, RULES);
  assert.equal(mostSevereTier(hits, RULES), "EMERGENCY");
  assert.deepEqual(hits.map((hit) => hit.ruleId), ["RF_UNCONSCIOUS", "RF_HEAVY_BLEEDING_ANY"]);
});

test("generic weakness is not treated as one-sided weakness", () => {
  const generic = buildEncounter(adult, {
    PRIMARY_CONCERN: "weak_dizzy",
    BODY_SIDE: "left",
    LOCAL_SYMPTOM_TYPE: "weakness",
    ONSET_PATTERN: "gradual",
  });
  assert.equal(generic.symptoms.includes("WEAKNESS_ONE_SIDE"), false);

  const explicit = buildEncounter(adult, {
    PRIMARY_CONCERN: "weak_dizzy",
    BODY_SIDE: "left",
    LOCAL_SYMPTOM_TYPE: "weakness",
    ONSET_PATTERN: "sudden",
  });
  assert.ok(explicit.symptoms.includes("WEAKNESS_ONE_SIDE"));
});

test("generic pain maps only after location and severity establish the existing code", () => {
  const mildAbdominal = buildEncounter(adult, {
    PRIMARY_CONCERN: "pain",
    BODY_REGION: "abdomen_pelvis",
    LOCAL_SYMPTOM_TYPE: "pain",
    SEVERITY_SCORE: 6,
  });
  assert.equal(mildAbdominal.symptoms.includes("SEVERE_ABDOMINAL_PAIN"), false);

  const severeAbdominal = buildEncounter(adult, {
    PRIMARY_CONCERN: "pain",
    BODY_REGION: "abdomen_pelvis",
    LOCAL_SYMPTOM_TYPE: "pain",
    SEVERITY_SCORE: 7,
  });
  assert.ok(severeAbdominal.symptoms.includes("SEVERE_ABDOMINAL_PAIN"));
  assert.equal(severeAbdominal.answers["PAIN_SCORE"], 7);
});

test("duration produces the canonical classifier inputs without bucket guessing", () => {
  const encounter = buildEncounter(adult, {
    PRIMARY_CONCERN: "fever",
    DURATION_ENTRY: "3|days",
  });
  assert.equal(encounter.answers["DURATION_HOURS"], 72);
  assert.equal(encounter.answers["FEVER_DAYS"], 3);
});

test("context-specific child answers reach their current rules", () => {
  const child: PatientContext = { ageMonths: 24, sex: "female", pregnancy: "no" };
  const encounter = buildEncounter(child, {
    CONTEXT_DANGER_SIGNS: encodeMulti(["blood_in_stool", "vomits_everything"]),
  });
  assert.ok(encounter.symptoms.includes("DIARRHOEA"));
  assert.ok(encounter.symptoms.includes("VOMITING"));
  assert.equal(encounter.answers["BLOOD_IN_STOOL"], true);
  assert.equal(encounter.answers["KEEPS_NOTHING_DOWN"], true);
  assert.equal(mostSevereTier(evaluateRedFlags(encounter, RULES), RULES), "GO_NOW");
});

test("the young-infant fever danger sign is reachable in the initial safety block", () => {
  const infant: PatientContext = { ageMonths: 1, sex: "female", pregnancy: "no" };
  const question = questionAt(4, infant, {});
  assert.ok(question.options?.some((option) => option.value === "infant_fever"));
  const encounter = buildEncounter(infant, { CONTEXT_DANGER_SIGNS: "infant_fever" });
  assert.equal(mostSevereTier(evaluateRedFlags(encounter, RULES), RULES), "EMERGENCY");
});

test("pregnancy safety selections preserve every applicable existing rule input", () => {
  const pregnant: PatientContext = { ageMonths: 300, sex: "female", pregnancy: "unknown" };
  const encounter = buildEncounter(pregnant, {
    IMMEDIATE_DANGER_SIGNS: "heavy_bleeding",
    CONTEXT_DANGER_SIGNS: encodeMulti([
      "severe_headache",
      "blurred_vision",
      "face_hands_swelling",
      "reduced_fetal_movement",
    ]),
  });
  assert.equal(encounter.answers["HEADACHE_SEVERE"], true);
  assert.ok(encounter.symptoms.includes("BLURRED_VISION"));
  assert.ok(encounter.symptoms.includes("SWELLING_FACE_HANDS"));
  assert.ok(encounter.symptoms.includes("REDUCED_FETAL_MOVEMENT"));
  const ids = evaluateRedFlags(encounter, RULES).map((hit) => hit.ruleId);
  assert.ok(ids.includes("RF_PREG_BLEEDING"));
  assert.ok(ids.includes("RF_PREG_SEVERE_HEADACHE_VISION"));
  assert.ok(ids.includes("RF_REDUCED_FETAL_MOVEMENT"));
});

test("adult chest pain and sudden speech difficulty are reachable without inference", () => {
  const encounter = buildEncounter({ ...adult, ageMonths: 420 }, {
    IMMEDIATE_DANGER_SIGNS: encodeMulti(["chest_pain", "speech_difficulty"]),
  });
  const ids = evaluateRedFlags(encounter, RULES).map((hit) => hit.ruleId);
  assert.ok(ids.includes("RF_CHEST_PAIN_ADULT"));
  assert.ok(ids.includes("RF_STROKE_SIGNS"));
});

test("changing an earlier answer removes all descendant questionnaire answers", () => {
  const answers = Object.fromEntries(QUESTION_IDS.map((id, index) => [id, `value-${index}`]));
  const pruned = pruneAfter(answers, 5);
  assert.equal(pruned["BODY_REGION"], "value-4");
  assert.equal(pruned["BODY_SIDE"], undefined);
  assert.equal(pruned["FINAL_LOCATION_MODE"], undefined);
});

test("stored answers can be reduced back to questionnaire state", () => {
  const extracted = extractIntakeAnswers({
    INTAKE_VERSION,
    BODY_REGION: "head_face",
    BODY_SIDE: "left",
    DURATION_HOURS: 48,
    GETTING_WORSE: true,
  });
  assert.deepEqual(extracted, { BODY_REGION: "head_face", BODY_SIDE: "left" });
});

test("reported location is descriptive and supports uncertainty", () => {
  assert.equal(reportedLocation({
    BODY_REGION: "head_face",
    BODY_SIDE: "left",
    BODY_SUBREGION: "eye",
    FINAL_LOCATION_MODE: "confirmed",
  }, "en"), "left — Eye");
  assert.equal(reportedLocation({ FINAL_LOCATION_MODE: "cannot_locate" }, "en"), "no single area identified");
  assert.equal(reportedLocation({
    BODY_REGION: "head_face",
    BODY_SIDE: "left",
    BODY_SUBREGION: "eye",
    FINAL_LOCATION_MODE: "confirmed",
  }, "mr"), "डावीकडे — डोळा");
});

test("all 15 adaptive positions expose Marathi prompts and options", () => {
  const patient: PatientContext = { ageMonths: 300, sex: "female", pregnancy: "yes" };
  const regions = ["head_face", "neck_throat", "chest", "abdomen_pelvis", "back", "arm_hand", "leg_foot", "skin", "all_over", "multiple"];
  for (let number = 1; number <= QUESTION_COUNT; number += 1) {
    for (const region of regions) {
      const question = questionAt(number, patient, { BODY_REGION: region });
      assert.notEqual(localizeQuestion(question, "mr"), question.en);
      for (const option of question.options ?? []) {
        assert.notEqual(localizeOption(option, "mr"), option.en);
      }
    }
  }
});

test("emergencies interrupt immediately and GO_NOW waits only for initial safety questions", () => {
  assert.equal(shouldEndIntakeForRedFlag("EMERGENCY", 1), true);
  assert.equal(shouldEndIntakeForRedFlag("GO_NOW", 2), false);
  assert.equal(shouldEndIntakeForRedFlag("GO_NOW", 4), true);
  assert.equal(shouldEndIntakeForRedFlag(undefined, 15), false);
});
