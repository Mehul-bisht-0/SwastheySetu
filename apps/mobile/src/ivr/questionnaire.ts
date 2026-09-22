import type {
  AnswerValue,
  Encounter,
  PatientContext,
  SymptomCode,
  UrgencyTier,
} from "@swasthyasetu/core";
import { MARATHI_OPTIONS, MARATHI_QUESTIONS, MARATHI_SIDE_LABELS } from "./questionnaireMarathi.ts";

export const INTAKE_VERSION = "intake-v1.0.0";
export const QUESTION_COUNT = 15;
export const QUESTION_IDS = [
  "PRIMARY_CONCERN",
  "IMMEDIATE_DANGER_SIGNS",
  "DRINKING",
  "CONTEXT_DANGER_SIGNS",
  "BODY_REGION",
  "BODY_SIDE",
  "BODY_SUBREGION",
  "LOCAL_SYMPTOM_TYPE",
  "ONSET_PATTERN",
  "DURATION_ENTRY",
  "SEVERITY_SCORE",
  "ASSOCIATED_AND_PROGRESSION",
  "ACTIVITY",
  "TRIGGER_AND_CONTEXT",
  "FINAL_LOCATION_MODE",
] as const;

export type IntakeLocale = "hi" | "mr" | "en";
export type IntakeAnswer = AnswerValue | undefined;
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type QuestionKind = "single" | "multi" | "number" | "duration";

export interface IntakeOption {
  value: string;
  hi: string;
  en: string;
}

export interface IntakeQuestion {
  number: number;
  id: string;
  kind: QuestionKind;
  hi: string;
  en: string;
  options?: IntakeOption[];
  max?: number;
}

const NOT_SURE: IntakeOption = { value: "not_sure", hi: "पता नहीं", en: "Not sure" };
const NONE: IntakeOption = { value: "none", hi: "इनमें से कोई नहीं", en: "None of these" };

const REGION_OPTIONS: IntakeOption[] = [
  { value: "head_face", hi: "सिर या चेहरा", en: "Head or face" },
  { value: "neck_throat", hi: "गर्दन या गला", en: "Neck or throat" },
  { value: "chest", hi: "सीना", en: "Chest" },
  { value: "abdomen_pelvis", hi: "पेट या श्रोणि", en: "Stomach or pelvis" },
  { value: "back", hi: "पीठ", en: "Back" },
  { value: "arm_hand", hi: "बाँह या हाथ", en: "Arm or hand" },
  { value: "leg_foot", hi: "टाँग या पैर", en: "Leg or foot" },
  { value: "skin", hi: "त्वचा", en: "Skin" },
  { value: "all_over", hi: "पूरे शरीर में", en: "All over" },
  { value: "multiple", hi: "एक से अधिक जगह", en: "More than one area" },
  NOT_SURE,
];

const SUBREGIONS: Record<string, IntakeOption[]> = {
  head_face: [
    { value: "forehead", hi: "माथा", en: "Forehead" },
    { value: "eye", hi: "आँख", en: "Eye" },
    { value: "ear", hi: "कान", en: "Ear" },
    { value: "nose", hi: "नाक", en: "Nose" },
    { value: "mouth_jaw", hi: "मुँह या जबड़ा", en: "Mouth or jaw" },
    { value: "back_of_head", hi: "सिर का पिछला भाग", en: "Back of head" },
    { value: "whole_head", hi: "पूरा सिर", en: "Whole head" },
    NOT_SURE,
  ],
  neck_throat: [
    { value: "front_neck", hi: "गर्दन का आगे का भाग", en: "Front of neck" },
    { value: "back_neck", hi: "गर्दन का पिछला भाग", en: "Back of neck" },
    { value: "throat", hi: "गला", en: "Throat" },
    NOT_SURE,
  ],
  chest: [
    { value: "centre_chest", hi: "सीने का बीच", en: "Centre of chest" },
    { value: "upper_chest", hi: "सीने का ऊपरी भाग", en: "Upper chest" },
    { value: "lower_chest", hi: "सीने का निचला भाग", en: "Lower chest" },
    { value: "ribs", hi: "पसलियों के पास", en: "Around the ribs" },
    NOT_SURE,
  ],
  abdomen_pelvis: [
    { value: "upper_abdomen", hi: "पेट का ऊपरी भाग", en: "Upper stomach" },
    { value: "lower_abdomen", hi: "पेट का निचला भाग", en: "Lower stomach" },
    { value: "around_navel", hi: "नाभि के पास", en: "Around the navel" },
    { value: "pelvis_groin", hi: "श्रोणि या जाँघ का जोड़", en: "Pelvis or groin" },
    NOT_SURE,
  ],
  back: [
    { value: "upper_back", hi: "पीठ का ऊपरी भाग", en: "Upper back" },
    { value: "middle_back", hi: "पीठ का बीच", en: "Middle back" },
    { value: "lower_back", hi: "कमर", en: "Lower back" },
    NOT_SURE,
  ],
  arm_hand: [
    { value: "shoulder", hi: "कंधा", en: "Shoulder" },
    { value: "upper_arm", hi: "ऊपरी बाँह", en: "Upper arm" },
    { value: "elbow", hi: "कोहनी", en: "Elbow" },
    { value: "forearm", hi: "बाँह का निचला भाग", en: "Forearm" },
    { value: "wrist_hand", hi: "कलाई या हाथ", en: "Wrist or hand" },
    { value: "finger", hi: "उँगली", en: "Finger" },
    NOT_SURE,
  ],
  leg_foot: [
    { value: "hip", hi: "कूल्हा", en: "Hip" },
    { value: "thigh", hi: "जाँघ", en: "Thigh" },
    { value: "knee", hi: "घुटना", en: "Knee" },
    { value: "calf", hi: "पिंडली", en: "Calf" },
    { value: "ankle", hi: "टखना", en: "Ankle" },
    { value: "foot_toe", hi: "पैर या पैर की उँगली", en: "Foot or toe" },
    NOT_SURE,
  ],
  skin: [
    { value: "one_patch", hi: "एक जगह", en: "One patch" },
    { value: "several_patches", hi: "कई जगह", en: "Several patches" },
    { value: "widespread_skin", hi: "त्वचा पर दूर-दूर तक", en: "Widespread on the skin" },
    NOT_SURE,
  ],
  all_over: [{ value: "whole_body", hi: "पूरा शरीर", en: "Whole body" }, NOT_SURE],
  multiple: [{ value: "several_areas", hi: "कई हिस्से", en: "Several areas" }, NOT_SURE],
  not_sure: [NOT_SURE],
};

function selected(value: IntakeAnswer): Set<string> {
  if (typeof value !== "string" || value.length === 0) return new Set();
  return new Set(value.split("|").filter(Boolean));
}

export function encodeMulti(values: Iterable<string>): string {
  return [...new Set(values)].sort().join("|");
}

export function decodeMulti(value: IntakeAnswer): string[] {
  return [...selected(value)];
}

export function questionAt(
  number: number,
  patient: PatientContext,
  answers: IntakeAnswers,
): IntakeQuestion {
  switch (number) {
    case 1:
      return {
        number, id: "PRIMARY_CONCERN", kind: "single",
        hi: "अभी सबसे बड़ी तकलीफ़ क्या है?", en: "What is the main problem right now?",
        options: [
          { value: "pain", hi: "दर्द", en: "Pain" },
          { value: "fever", hi: "बुखार", en: "Fever" },
          { value: "breathing_fast", hi: "साँस तेज़ है या लेने में कठिनाई है", en: "Fast or difficult breathing" },
          { value: "cough", hi: "खाँसी", en: "Cough" },
          { value: "weak_dizzy", hi: "कमज़ोरी या चक्कर", en: "Weakness or dizziness" },
          { value: "digestive", hi: "पेट, दस्त या उल्टी की तकलीफ़", en: "Stomach, diarrhoea, or vomiting problem" },
          { value: "urinary", hi: "पेशाब की तकलीफ़", en: "Urination problem" },
          { value: "rash_skin", hi: "दाने या त्वचा की तकलीफ़", en: "Rash or skin problem" },
          { value: "injury", hi: "चोट", en: "Injury" },
          { value: "heavy_bleeding", hi: "बहुत खून बह रहा है और रुक नहीं रहा", en: "Heavy bleeding that is not stopping" },
          { value: "pregnancy", hi: "गर्भावस्था से जुड़ी चिंता", en: "Pregnancy-related concern" },
          { value: "other", hi: "कुछ और", en: "Something else" },
          NOT_SURE,
        ],
      };
    case 2:
      return {
        number, id: "IMMEDIATE_DANGER_SIGNS", kind: "multi",
        hi: "इनमें से क्या अभी हो रहा है? जो भी लागू हो, सब चुनें।",
        en: "Which of these is happening now? Choose everything that applies.",
        options: [
          { value: "unconscious", hi: "मरीज़ जाग नहीं रहा", en: "The person is not waking up" },
          { value: "convulsion", hi: "शरीर में झटके या दौरा", en: "Body jerks or a fit" },
          { value: "breathing_fast", hi: "साँस तेज़ है या लेने में कठिनाई है", en: "Fast or difficult breathing" },
          { value: "heavy_bleeding", hi: "बहुत खून बह रहा है और रुक नहीं रहा", en: "Heavy bleeding that is not stopping" },
          { value: "chest_pain", hi: "सीने में दर्द", en: "Chest pain" },
          { value: "one_side_weak", hi: "एक तरफ़ अचानक कमज़ोरी", en: "Sudden weakness on one side" },
          { value: "speech_difficulty", hi: "अचानक बोलने में कठिनाई", en: "Sudden difficulty speaking" },
          NONE,
        ],
      };
    case 3:
      return {
        number, id: "DRINKING", kind: "single",
        hi: "मरीज़ पानी, दूध या खाना कैसे ले पा रहा है?",
        en: "How is the person managing water, milk, or food?",
        options: [
          { value: "normally", hi: "सामान्य रूप से", en: "Normally" },
          { value: "poorly", hi: "सामान्य से कम", en: "Less than usual" },
          { value: "unable", hi: "बिल्कुल नहीं पी पा रहा", en: "Unable to drink" },
          NOT_SURE,
        ],
      };
    case 4: {
      const context: IntakeOption[] = [];
      if (patient.ageMonths < 2) {
        context.push({ value: "infant_fever", hi: "दो महीने से छोटे बच्चे को बुखार है", en: "A baby under two months has a fever" });
      }
      if (patient.ageMonths < 60) {
        context.push(
          { value: "not_feeding", hi: "बच्चा दूध या खाना नहीं ले रहा", en: "The child is not feeding" },
          { value: "blood_in_stool", hi: "मल में खून है", en: "There is blood in the stool" },
          { value: "vomits_everything", hi: "हर चीज़ खाने या पीने पर उल्टी हो जाती है", en: "The child vomits everything eaten or drunk" },
        );
      }
      if (patient.pregnancy !== "no") {
        context.push(
          { value: "severe_headache", hi: "सिर में बहुत तेज़ दर्द है", en: "There is a severe headache" },
          { value: "blurred_vision", hi: "धुँधला दिखाई दे रहा है", en: "Vision is blurred" },
          { value: "face_hands_swelling", hi: "चेहरे या हाथों में सूजन है", en: "The face or hands are swollen" },
          { value: "reduced_fetal_movement", hi: "गर्भ में बच्चा कम हिल रहा है", en: "The baby is moving less than usual" },
        );
      }
      context.push(
        { value: "blood_in_stool", hi: "मल में खून है", en: "There is blood in the stool" },
        { value: "vomits_everything", hi: "हर चीज़ खाने या पीने पर उल्टी हो जाती है", en: "Everything eaten or drunk is vomited" },
        NONE,
      );
      return {
        number, id: "CONTEXT_DANGER_SIGNS", kind: "multi",
        hi: "इनमें से क्या लागू होता है?", en: "Which of these applies?",
        options: uniqueOptions(context),
      };
    }
    case 5:
      return { number, id: "BODY_REGION", kind: "single", hi: "तकलीफ़ शरीर के किस हिस्से में है?", en: "Where in the body is the problem?", options: REGION_OPTIONS };
    case 6:
      return {
        number, id: "BODY_SIDE", kind: "single",
        hi: "तकलीफ़ किस तरफ़ है?", en: "Which side is affected?",
        options: [
          { value: "left", hi: "बाईं तरफ़", en: "Left" },
          { value: "right", hi: "दाईं तरफ़", en: "Right" },
          { value: "both", hi: "दोनों तरफ़", en: "Both sides" },
          { value: "middle", hi: "बीच में", en: "In the middle" },
          { value: "widespread", hi: "कई जगह या पूरे हिस्से में", en: "Widespread" },
          { value: "not_applicable", hi: "यह लागू नहीं होता", en: "Not applicable" },
          NOT_SURE,
        ],
      };
    case 7: {
      const region = typeof answers["BODY_REGION"] === "string" ? answers["BODY_REGION"] : "not_sure";
      return {
        number, id: "BODY_SUBREGION", kind: "single",
        hi: "उस हिस्से में तकलीफ़ सबसे ज़्यादा कहाँ है?", en: "Where is the problem strongest in that area?",
        options: SUBREGIONS[region] ?? [NOT_SURE],
      };
    }
    case 8:
      return {
        number, id: "LOCAL_SYMPTOM_TYPE", kind: "single",
        hi: "उस जगह क्या महसूस हो रहा है?", en: "What do you feel in that area?",
        options: [
          { value: "pain", hi: "दर्द", en: "Pain" },
          { value: "swelling", hi: "सूजन", en: "Swelling" },
          { value: "burning", hi: "जलन", en: "Burning" },
          { value: "burning_urination", hi: "पेशाब करते समय जलन", en: "Burning while urinating" },
          { value: "itching", hi: "खुजली", en: "Itching" },
          { value: "numbness", hi: "सुन्नपन", en: "Numbness" },
          { value: "weakness", hi: "कमज़ोरी", en: "Weakness" },
          { value: "movement_difficulty", hi: "हिलाने में कठिनाई", en: "Difficulty moving" },
          { value: "rash", hi: "दाने या चकत्ते", en: "Rash or spots" },
          { value: "injury", hi: "चोट", en: "Injury" },
          { value: "other", hi: "कुछ और", en: "Something else" },
          NOT_SURE,
        ],
      };
    case 9:
      return {
        number, id: "ONSET_PATTERN", kind: "single",
        hi: "तकलीफ़ कैसे शुरू हुई?", en: "How did the problem start?",
        options: [
          { value: "sudden", hi: "अचानक", en: "Suddenly" },
          { value: "gradual", hi: "धीरे-धीरे", en: "Gradually" },
          { value: "after_event", hi: "किसी घटना या काम के बाद", en: "After an event or activity" },
          NOT_SURE,
        ],
      };
    case 10:
      return { number, id: "DURATION_ENTRY", kind: "duration", hi: "यह तकलीफ़ कितने समय से है?", en: "How long has this problem been present?" };
    case 11: {
      const pain = answers["PRIMARY_CONCERN"] === "pain" || answers["LOCAL_SYMPTOM_TYPE"] === "pain";
      return {
        number, id: "SEVERITY_SCORE", kind: "number", max: 10,
        hi: pain ? "दर्द कितना है? 0 दर्द नहीं, 10 सबसे तेज़ दर्द।" : "तकलीफ़ कितनी तेज़ है? 0 बिल्कुल नहीं, 10 सबसे ज़्यादा।",
        en: pain ? "How strong is the pain? 0 is no pain and 10 is the worst pain." : "How severe is the problem? 0 is none and 10 is the most severe.",
      };
    }
    case 12:
      return {
        number, id: "ASSOCIATED_AND_PROGRESSION", kind: "multi",
        hi: "और क्या हो रहा है? जो भी लागू हो, सब चुनें।", en: "What else is happening? Choose everything that applies.",
        options: [
          { value: "getting_worse", hi: "तकलीफ़ बढ़ रही है", en: "The problem is getting worse" },
          { value: "spreading", hi: "दूसरी जगह फैल रही है", en: "It is spreading to another area" },
          { value: "fever", hi: "बुखार", en: "Fever" },
          { value: "cough", hi: "खाँसी", en: "Cough" },
          { value: "breathing_fast", hi: "साँस तेज़ है या लेने में कठिनाई है", en: "Fast or difficult breathing" },
          { value: "vomiting", hi: "उल्टी", en: "Vomiting" },
          { value: "diarrhoea", hi: "पतले दस्त", en: "Loose stools" },
          { value: "dizziness", hi: "चक्कर", en: "Dizziness" },
          NONE,
        ],
      };
    case 13:
      return {
        number, id: "ACTIVITY", kind: "single",
        hi: "यह तकलीफ़ रोज़ के काम पर कितना असर डाल रही है?", en: "How much is this affecting normal activities?",
        options: [
          { value: "normal", hi: "कोई असर नहीं", en: "No effect" },
          { value: "less_active", hi: "सामान्य से कम काम कर पा रहा है", en: "Able to do less than usual" },
          { value: "basic_activities_impossible", hi: "चलना या ज़रूरी काम करना संभव नहीं", en: "Unable to walk or do basic activities" },
          NOT_SURE,
        ],
      };
    case 14:
      return {
        number, id: "TRIGGER_AND_CONTEXT", kind: "multi",
        hi: "तकलीफ़ से पहले क्या हुआ था?", en: "What happened before the problem started?",
        options: [
          { value: "injury", hi: "चोट लगी", en: "An injury" },
          { value: "physical_work", hi: "भारी या शारीरिक काम", en: "Heavy or physical work" },
          { value: "eating", hi: "खाने के बाद", en: "After eating" },
          { value: "insect_bite", hi: "कीड़े ने काटा", en: "An insect bite" },
          { value: "medicine", hi: "दवा लेने के बाद", en: "After taking medicine" },
          { value: "chronic_illness", hi: "लंबे समय की स्वास्थ्य समस्या है", en: "There is a long-term health condition" },
          { value: "other", hi: "कुछ और", en: "Something else" },
          NONE,
        ],
      };
    case 15:
      return {
        number, id: "FINAL_LOCATION_MODE", kind: "single",
        hi: "आख़िर में, तकलीफ़ सबसे ज़्यादा कहाँ महसूस होती है?", en: "Finally, where is the problem strongest?",
        options: [
          { value: "confirmed", hi: "ऊपर चुनी हुई जगह", en: "The area selected above" },
          { value: "multiple", hi: "एक से अधिक जगह", en: "More than one area" },
          { value: "all_over", hi: "पूरे शरीर में", en: "All over" },
          { value: "cannot_locate", hi: "ठीक जगह नहीं बता सकता", en: "I cannot identify one place" },
        ],
      };
    default:
      throw new RangeError(`Question number must be between 1 and ${QUESTION_COUNT}`);
  }
}

function uniqueOptions(options: IntakeOption[]): IntakeOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function add(set: Set<SymptomCode>, code: SymptomCode): void {
  set.add(code);
}

function addSelectedSymptoms(set: Set<SymptomCode>, values: Set<string>): void {
  if (values.has("unconscious")) add(set, "UNCONSCIOUS");
  if (values.has("convulsion")) add(set, "CONVULSION");
  if (values.has("breathing_fast")) add(set, "FAST_BREATHING");
  if (values.has("heavy_bleeding")) add(set, "BLEEDING_HEAVY");
  if (values.has("chest_pain")) add(set, "CHEST_PAIN");
  if (values.has("one_side_weak")) add(set, "WEAKNESS_ONE_SIDE");
  if (values.has("speech_difficulty")) add(set, "DIFFICULTY_SPEAKING");
  if (values.has("fever")) add(set, "FEVER");
  if (values.has("cough")) add(set, "COUGH");
  if (values.has("vomiting")) add(set, "VOMITING");
  if (values.has("diarrhoea")) add(set, "DIARRHOEA");
  if (values.has("injury")) add(set, "INJURY");
}

function durationHours(value: IntakeAnswer): number | undefined {
  if (typeof value !== "string") return undefined;
  const [rawAmount, unit] = value.split("|");
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  if (unit === "minutes") return amount / 60;
  if (unit === "hours") return amount;
  if (unit === "days") return amount * 24;
  if (unit === "weeks") return amount * 24 * 7;
  return undefined;
}

/**
 * Convert questionnaire data into the existing, versioned decision-engine input.
 * This function collects and normalises input only. It never selects an urgency.
 */
export function buildEncounter(
  patient: PatientContext,
  questionnaireAnswers: IntakeAnswers,
  seedSymptoms: readonly SymptomCode[] = [],
): Encounter {
  const symptoms = new Set<SymptomCode>(seedSymptoms);
  const answers: Record<string, AnswerValue | undefined> = {
    ...questionnaireAnswers,
    INTAKE_VERSION,
  };
  for (const derivedKey of [
    "BLOOD_IN_STOOL",
    "KEEPS_NOTHING_DOWN",
    "HEADACHE_SEVERE",
    "DURATION_HOURS",
    "FEVER_DAYS",
    "SYMPTOM_SEVERITY_SCORE",
    "PAIN_SCORE",
    "GETTING_WORSE",
    "CHRONIC_ILLNESS",
  ]) delete answers[derivedKey];

  const primary = questionnaireAnswers["PRIMARY_CONCERN"];
  if (primary === "fever") add(symptoms, "FEVER");
  if (primary === "breathing_fast") add(symptoms, "FAST_BREATHING");
  if (primary === "cough") add(symptoms, "COUGH");
  if (primary === "rash_skin") add(symptoms, "RASH");
  if (primary === "injury") add(symptoms, "INJURY");
  if (primary === "heavy_bleeding") add(symptoms, "BLEEDING_HEAVY");

  addSelectedSymptoms(symptoms, selected(questionnaireAnswers["IMMEDIATE_DANGER_SIGNS"]));

  const drinking = questionnaireAnswers["DRINKING"];
  if (drinking === "normally" || drinking === "poorly" || drinking === "unable") {
    answers["DRINKING"] = drinking;
    if (drinking === "unable" && patient.ageMonths < 60) add(symptoms, "NOT_FEEDING");
  }

  const context = selected(questionnaireAnswers["CONTEXT_DANGER_SIGNS"]);
  if (context.has("infant_fever")) add(symptoms, "FEVER");
  if (context.has("not_feeding")) add(symptoms, "NOT_FEEDING");
  if (context.has("blood_in_stool")) {
    add(symptoms, "DIARRHOEA");
    answers["BLOOD_IN_STOOL"] = true;
  }
  if (context.has("vomits_everything")) {
    add(symptoms, "VOMITING");
    answers["KEEPS_NOTHING_DOWN"] = true;
  }
  if (context.has("severe_headache")) answers["HEADACHE_SEVERE"] = true;
  if (context.has("blurred_vision")) add(symptoms, "BLURRED_VISION");
  if (context.has("face_hands_swelling")) add(symptoms, "SWELLING_FACE_HANDS");
  if (context.has("reduced_fetal_movement")) add(symptoms, "REDUCED_FETAL_MOVEMENT");

  const localType = questionnaireAnswers["LOCAL_SYMPTOM_TYPE"];
  const region = questionnaireAnswers["BODY_REGION"];
  const side = questionnaireAnswers["BODY_SIDE"];
  const onset = questionnaireAnswers["ONSET_PATTERN"];
  if (localType === "rash") add(symptoms, "RASH");
  if (localType === "injury") add(symptoms, "INJURY");
  if (localType === "burning_urination") add(symptoms, "BURNING_URINATION");
  if (localType === "pain" && region === "chest") add(symptoms, "CHEST_PAIN");
  if (localType === "weakness" && onset === "sudden" && (side === "left" || side === "right")) {
    add(symptoms, "WEAKNESS_ONE_SIDE");
  }

  const hours = durationHours(questionnaireAnswers["DURATION_ENTRY"]);
  if (hours !== undefined) {
    answers["DURATION_HOURS"] = hours;
    if (symptoms.has("FEVER")) answers["FEVER_DAYS"] = hours / 24;
  }

  const severity = questionnaireAnswers["SEVERITY_SCORE"];
  if (typeof severity === "number") {
    answers["SYMPTOM_SEVERITY_SCORE"] = severity;
    const isPain = primary === "pain" || localType === "pain";
    if (isPain) answers["PAIN_SCORE"] = severity;
    if (isPain && region === "abdomen_pelvis" && severity >= 7) {
      add(symptoms, "SEVERE_ABDOMINAL_PAIN");
    }
  }

  const associated = selected(questionnaireAnswers["ASSOCIATED_AND_PROGRESSION"]);
  addSelectedSymptoms(symptoms, associated);
  if (associated.has("getting_worse")) answers["GETTING_WORSE"] = true;

  const activity = questionnaireAnswers["ACTIVITY"];
  if (activity === "less_active" || activity === "basic_activities_impossible") {
    answers["ACTIVITY"] = "less_active";
  } else if (activity === "normal") {
    answers["ACTIVITY"] = "normal";
  }

  const trigger = selected(questionnaireAnswers["TRIGGER_AND_CONTEXT"]);
  if (trigger.has("injury")) add(symptoms, "INJURY");
  if (trigger.has("chronic_illness")) answers["CHRONIC_ILLNESS"] = true;

  return { patient, symptoms: [...symptoms], answers };
}

export function pruneAfter(answers: IntakeAnswers, questionNumber: number): IntakeAnswers {
  const next = { ...answers };
  for (let number = questionNumber + 1; number <= QUESTION_COUNT; number += 1) {
    const id = QUESTION_IDS[number - 1];
    if (!id) continue;
    delete next[id];
  }
  return next;
}

export function extractIntakeAnswers(
  answers: Record<string, AnswerValue | undefined>,
): IntakeAnswers {
  const extracted: IntakeAnswers = {};
  for (const id of QUESTION_IDS) {
    const value = answers[id];
    if (value !== undefined) extracted[id] = value;
  }
  return extracted;
}

/** Emergency never waits; GO_NOW returns after the four initial safety questions. */
export function shouldEndIntakeForRedFlag(
  tier: UrgencyTier | undefined,
  answeredQuestionNumber: number,
): boolean {
  return tier === "EMERGENCY" || (tier === "GO_NOW" && answeredQuestionNumber >= 4);
}

const LABELS: Record<string, { hi: string; en: string }> = {};
for (const options of [REGION_OPTIONS, ...Object.values(SUBREGIONS)]) {
  for (const option of options) LABELS[option.value] = { hi: option.hi, en: option.en };
}
const SIDE_LABELS: Record<string, { hi: string; en: string }> = {
  left: { hi: "बाईं तरफ़", en: "left" },
  right: { hi: "दाईं तरफ़", en: "right" },
  both: { hi: "दोनों तरफ़", en: "both sides" },
  middle: { hi: "बीच में", en: "middle" },
  widespread: { hi: "कई जगह", en: "widespread" },
};

/** User-reported location only. It does not infer an organ or diagnosis. */
export function reportedLocation(answers: IntakeAnswers, locale: IntakeLocale): string {
  const mode = answers["FINAL_LOCATION_MODE"];
  if (mode === "multiple") return locale === "mr" ? "एकापेक्षा जास्त ठिकाणी" : locale === "hi" ? "एक से अधिक जगह" : "more than one area";
  if (mode === "all_over") return locale === "mr" ? "संपूर्ण शरीरात" : locale === "hi" ? "पूरे शरीर में" : "all over";
  if (mode === "cannot_locate" || mode === "not_sure") return locale === "mr" ? "एक ठराविक ठिकाण सांगता आले नाही" : locale === "hi" ? "ठीक जगह पता नहीं" : "no single area identified";

  const region = typeof answers["BODY_REGION"] === "string" ? answers["BODY_REGION"] : "not_sure";
  const subregion = typeof answers["BODY_SUBREGION"] === "string" ? answers["BODY_SUBREGION"] : "not_sure";
  const side = typeof answers["BODY_SIDE"] === "string" ? answers["BODY_SIDE"] : "not_sure";
  const main = locale === "mr"
    ? MARATHI_OPTIONS[subregion] ?? MARATHI_OPTIONS[region]
    : LABELS[subregion]?.[locale] ?? LABELS[region]?.[locale];
  if (!main || region === "not_sure" || subregion === "not_sure") {
    return locale === "mr" ? "एक ठराविक ठिकाण सांगता आले नाही" : locale === "hi" ? "ठीक जगह पता नहीं" : "no single area identified";
  }
  const sideLabel = locale === "mr" ? MARATHI_SIDE_LABELS[side] : SIDE_LABELS[side]?.[locale];
  return sideLabel ? `${sideLabel} — ${main}` : main;
}

export function localizeQuestion(question: IntakeQuestion, locale: IntakeLocale): string {
  if (locale === "mr") {
    if (question.id === "SEVERITY_SCORE") {
      return question.en.startsWith("How strong is the pain")
        ? "वेदना किती तीव्र आहेत? ० म्हणजे वेदना नाहीत आणि १० म्हणजे सर्वात तीव्र वेदना."
        : "त्रास किती तीव्र आहे? ० म्हणजे अजिबात नाही आणि १० म्हणजे सर्वात जास्त.";
    }
    return MARATHI_QUESTIONS[question.id] ?? question.en;
  }
  return question[locale];
}

export function localizeOption(option: IntakeOption, locale: IntakeLocale): string {
  if (locale === "mr") return MARATHI_OPTIONS[option.value] ?? option.en;
  return option[locale];
}
