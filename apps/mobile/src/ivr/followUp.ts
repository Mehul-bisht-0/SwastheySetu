/** Shared input questions for the existing deterministic rules; no clinical decisions. */
import type { Encounter, AnswerValue } from "@swasthyasetu/core";
import { mayBePregnant } from "@swasthyasetu/core";
export interface FollowUpQuestion {
  id: string; hi: string; en: string;
  options?: Array<{ value: AnswerValue; hi: string; en: string }>;
  max?: number;
}
const yesNo = [{ value: true, hi: "हाँ", en: "Yes" }, { value: false, hi: "नहीं", en: "No" }];
export function followUpQuestions(e: Encounter): FollowUpQuestion[] {
  return [
    { id: "DRINKING", hi: "क्या आप पानी या दूध पी पा रहे हैं?", en: "Can you drink water or milk?", options: [
      { value: "normally", hi: "सामान्य रूप से", en: "Normally" },
      { value: "poorly", hi: "सामान्य से कम", en: "Less than usual" },
      { value: "unable", hi: "बिल्कुल नहीं पी पा रहे", en: "Unable to drink" },
    ] },
    ...(mayBePregnant(e) ? [{ id: "HEADACHE_SEVERE", hi: "क्या सिर में बहुत तेज़ दर्द है?", en: "Do you have a severe headache?", options: yesNo }] : []),
    ...(e.symptoms.includes("DIARRHOEA") ? [{ id: "BLOOD_IN_STOOL", hi: "क्या मल में खून है?", en: "Is there blood in your stool?", options: yesNo }] : []),
    ...(e.symptoms.includes("VOMITING") ? [{ id: "KEEPS_NOTHING_DOWN", hi: "क्या हर बार खाने या पीने पर उल्टी हो जाती है?", en: "Do you vomit everything you eat or drink?", options: yesNo }] : []),
    { id: "DURATION_HOURS", hi: "तकलीफ़ शुरू हुए कितने घंटे हुए हैं?", en: "How many hours have you had these symptoms?", max: 87600 },
    ...(e.symptoms.includes("FEVER") ? [{ id: "FEVER_DAYS", hi: "बुखार कितने दिनों से है?", en: "How many days have you had a fever?", max: 3650 }] : []),
    { id: "ACTIVITY", hi: "क्या आप सामान्य से कम सक्रिय हैं?", en: "Are you less active than usual?", options: [
      { value: "less_active", hi: "हाँ", en: "Yes" }, { value: "normal", hi: "नहीं", en: "No" },
    ] },
    { id: "CHRONIC_ILLNESS", hi: "क्या आपको लंबे समय से कोई स्वास्थ्य समस्या है?", en: "Do you have a long-term health condition?", options: yesNo },
    { id: "GETTING_WORSE", hi: "क्या तकलीफ़ बढ़ रही है?", en: "Are your symptoms getting worse?", options: yesNo },
    { id: "PAIN_SCORE", hi: "दर्द कितना है? 0 का मतलब दर्द नहीं और 10 सबसे तेज़ दर्द है।", en: "How strong is your pain? 0 means no pain and 10 means the worst pain.", max: 10 },
  ];
}
