import type { Encounter, PatientContext, SymptomCode } from "@swasthyasetu/core";

export interface Draft {
  patient: PatientContext | null;
  symptoms: SymptomCode[];
  answers: Record<string, unknown>;
}

let draft: Draft = { patient: null, symptoms: [], answers: {} };
const listeners = new Set<(d: Draft) => void>();
function notify() { listeners.forEach((fn) => fn({ ...draft, symptoms: [...draft.symptoms], answers: { ...draft.answers } })); }

export function reset(): void { draft = { patient: null, symptoms: [], answers: {} }; notify(); }
export function setPatient(p: PatientContext): void { draft = { ...draft, patient: p }; notify(); }
export function toggleSymptom(code: SymptomCode): void {
  const s = draft.symptoms.includes(code)
    ? draft.symptoms.filter((c) => c !== code)
    : [...draft.symptoms, code];
  draft = { ...draft, symptoms: s };
  notify();
}
export function answer(questionId: string, value: unknown): void { draft = { ...draft, answers: { ...draft.answers, [questionId]: value } }; notify(); }
export function getDraft(): Draft { return { ...draft, symptoms: [...draft.symptoms], answers: { ...draft.answers } }; }
export function toEncounter(): Encounter | null {
  if (!draft.patient || draft.symptoms.length === 0) return null;
  return { patient: draft.patient, symptoms: draft.symptoms, answers: draft.answers as Record<string, string | number | boolean | undefined> };
}
export function subscribe(fn: (d: Draft) => void): () => void {
  listeners.add(fn);
  fn(getDraft());
  return () => listeners.delete(fn);
}
