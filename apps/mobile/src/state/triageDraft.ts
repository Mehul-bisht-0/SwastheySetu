import type {
  AnswerValue,
  Encounter,
  PatientContext,
  SymptomCode,
} from "@swasthyasetu/core";

export interface Draft {
  patient: PatientContext | null;
  symptoms: SymptomCode[];
  answers: Record<string, AnswerValue | undefined>;
}

let draft: Draft = { patient: null, symptoms: [], answers: {} };
const listeners = new Set<(d: Draft) => void>();

function notify(): void {
  listeners.forEach((fn) => fn({
    ...draft,
    symptoms: [...draft.symptoms],
    answers: { ...draft.answers },
  }));
}

export function reset(): void {
  draft = { patient: null, symptoms: [], answers: {} };
  notify();
}

export function setPatient(patient: PatientContext): void {
  draft = { ...draft, patient };
  notify();
}

export function toggleSymptom(code: SymptomCode): void {
  const symptoms = draft.symptoms.includes(code)
    ? draft.symptoms.filter((candidate) => candidate !== code)
    : [...draft.symptoms, code];
  draft = { ...draft, symptoms };
  notify();
}

export function answer(questionId: string, value: AnswerValue | undefined): void {
  const answers = { ...draft.answers };
  if (value === undefined) delete answers[questionId];
  else answers[questionId] = value;
  draft = { ...draft, answers };
  notify();
}

export function replaceEncounter(encounter: Encounter): void {
  draft = {
    patient: encounter.patient,
    symptoms: [...encounter.symptoms],
    answers: { ...encounter.answers },
  };
  notify();
}

export function getDraft(): Draft {
  return {
    ...draft,
    symptoms: [...draft.symptoms],
    answers: { ...draft.answers },
  };
}

export function toEncounter(): Encounter | null {
  if (!draft.patient) return null;
  const questionnaireStarted = draft.answers["INTAKE_VERSION"] !== undefined;
  if (draft.symptoms.length === 0 && !questionnaireStarted) return null;
  return {
    patient: draft.patient,
    symptoms: [...draft.symptoms],
    answers: { ...draft.answers },
  };
}

export function subscribe(fn: (draft: Draft) => void): () => void {
  listeners.add(fn);
  fn(getDraft());
  return () => listeners.delete(fn);
}
