/**
 * In-app IVR: spoken prompts with large numbered choices.
 *
 * Answers are converted into the same Encounter used by the tap flow. The
 * deterministic core engine remains the only code that decides urgency.
 */
import React, { useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { evaluateRedFlags, mostSevereTier, RULES } from "@swasthyasetu/core";
import type {
  Encounter,
  Pregnancy,
  Sex,
  SymptomCode,
} from "@swasthyasetu/core";

import { reset, setPatient, toggleSymptom } from "../../src/state/triageDraft.ts";
import {
  getLocale,
  setLocale,
  t,
  type Locale,
  type StringKey,
} from "../../src/i18n/strings.ts";
import { ink, paper, radius, space, touch, type } from "../../src/theme/tokens.ts";
import { Button } from "../../src/ui/Button.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { Screen } from "../../src/ui/Screen.tsx";
import {
  stopVoicePrompt,
  useVoicePrompt,
} from "../../src/ivr/useVoicePrompt.ts";

type Step =
  | "LANGUAGE"
  | "INTRO"
  | "AGE"
  | "SEX"
  | "PREGNANCY"
  | "SYMPTOM"
  | "NO_SYMPTOMS"
  | "SAVING"
  | "SAVE_ERROR";

const SYMPTOM_ORDER: readonly SymptomCode[] = [
  "UNCONSCIOUS",
  "CONVULSION",
  "FAST_BREATHING",
  "BLEEDING_HEAVY",
  "NOT_FEEDING",
  "CHEST_PAIN",
  "WEAKNESS_ONE_SIDE",
  "DIFFICULTY_SPEAKING",
  "SWELLING_FACE_HANDS",
  "BLURRED_VISION",
  "REDUCED_FETAL_MOVEMENT",
  "SEVERE_ABDOMINAL_PAIN",
  "FEVER",
  "COUGH",
  "DIARRHOEA",
  "VOMITING",
  "RASH",
  "INJURY",
  "BURNING_URINATION",
];

const SYMPTOM_PROMPT: Record<SymptomCode, StringKey> = {
  UNCONSCIOUS: "ivr.symptom.UNCONSCIOUS",
  CONVULSION: "ivr.symptom.CONVULSION",
  FAST_BREATHING: "ivr.symptom.FAST_BREATHING",
  BLEEDING_HEAVY: "ivr.symptom.BLEEDING_HEAVY",
  NOT_FEEDING: "ivr.symptom.NOT_FEEDING",
  CHEST_PAIN: "ivr.symptom.CHEST_PAIN",
  WEAKNESS_ONE_SIDE: "ivr.symptom.WEAKNESS_ONE_SIDE",
  DIFFICULTY_SPEAKING: "ivr.symptom.DIFFICULTY_SPEAKING",
  SWELLING_FACE_HANDS: "ivr.symptom.SWELLING_FACE_HANDS",
  BLURRED_VISION: "ivr.symptom.BLURRED_VISION",
  REDUCED_FETAL_MOVEMENT: "ivr.symptom.REDUCED_FETAL_MOVEMENT",
  SEVERE_ABDOMINAL_PAIN: "ivr.symptom.SEVERE_ABDOMINAL_PAIN",
  FEVER: "ivr.symptom.FEVER",
  COUGH: "ivr.symptom.COUGH",
  DIARRHOEA: "ivr.symptom.DIARRHOEA",
  VOMITING: "ivr.symptom.VOMITING",
  RASH: "ivr.symptom.RASH",
  INJURY: "ivr.symptom.INJURY",
  BURNING_URINATION: "ivr.symptom.BURNING_URINATION",
};

function KeyChoice(props: {
  digit: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.digit}. ${props.label}`}
      accessibilityState={{ disabled: props.disabled ?? false }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.keyChoice,
        props.disabled && styles.keyChoiceDisabled,
        pressed && styles.keyChoicePressed,
      ]}
    >
      <View style={styles.digitBox}>
        <Text style={styles.digit}>{props.digit}</Text>
      </View>
      <Text style={styles.choiceLabel}>{props.label}</Text>
    </Pressable>
  );
}

function isPregnancyQuestionRelevant(sex: Sex, ageMonths: number): boolean {
  return sex === "female" && ageMonths >= 144 && ageMonths <= 600;
}

export default function IvrScreen(): React.ReactNode {
  const router = useRouter();
  const [step, setStep] = useState<Step>("LANGUAGE");
  const [locale, setScreenLocale] = useState<Locale>(() => getLocale());
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [ageInput, setAgeInput] = useState("");
  const [ageUnit, setAgeUnit] = useState<"years" | "months">("years");
  const [sex, setSex] = useState<Sex | null>(null);
  const [pregnancy, setPregnancy] = useState<Pregnancy>("no");
  const [symptomIndex, setSymptomIndex] = useState(0);
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomCode[]>([]);

  const parsedAge = Number.parseInt(ageInput, 10);
  const ageMonths = Number.isInteger(parsedAge) && parsedAge >= 0
    ? (ageUnit === "years" ? parsedAge * 12 : parsedAge)
    : null;
  const ageIsValid = ageMonths !== null && ageMonths <= 1440;
  const currentSymptom = SYMPTOM_ORDER[symptomIndex];

  const spokenPrompt = useMemo(() => {
    switch (step) {
      case "LANGUAGE":
        return t("ivr.language.spoken");
      case "INTRO":
        return `${t("ivr.intro.body")} ${t("ivr.intro.safety")} ${t("ivr.startHint")}`;
      case "AGE":
        return `${t("ivr.age.title")} ${t("ivr.age.help")}`;
      case "SEX":
        return `${t("ivr.sex.title")} ${t("ivr.sex.hint")}`;
      case "PREGNANCY":
        return `${t("ivr.pregnancy.title")} ${t("ivr.threeChoiceHint")}`;
      case "SYMPTOM":
        return currentSymptom
          ? `${t(SYMPTOM_PROMPT[currentSymptom])} ${t("ivr.answerHint")}`
          : "";
      case "NO_SYMPTOMS":
        return t("ivr.noSymptoms.body");
      case "SAVING":
        return t("ivr.saving");
      case "SAVE_ERROR":
        return t("error.saveFailed");
    }
  }, [currentSymptom, locale, step]);

  const { repeat, speechFailed } = useVoicePrompt(spokenPrompt, locale, voiceEnabled);

  function chooseLanguage(nextLocale: Locale): void {
    setLocale(nextLocale);
    setScreenLocale(nextLocale);
    setStep("INTRO");
  }

  function leave(): void {
    stopVoicePrompt();
    router.replace("/");
  }

  function moveFromAge(): void {
    if (!ageIsValid) return;
    Keyboard.dismiss();
    setStep("SEX");
  }

  function chooseSex(nextSex: Sex): void {
    if (ageMonths === null) return;
    setSex(nextSex);
    if (isPregnancyQuestionRelevant(nextSex, ageMonths)) {
      setStep("PREGNANCY");
      return;
    }
    setPregnancy("no");
    setSymptomIndex(0);
    setStep("SYMPTOM");
  }

  function choosePregnancy(nextPregnancy: Pregnancy): void {
    setPregnancy(nextPregnancy);
    setSymptomIndex(0);
    setStep("SYMPTOM");
  }

  function saveAndShowResult(symptoms: SymptomCode[]): void {
    if (!ageIsValid || ageMonths === null || sex === null) return;
    reset();
    setPatient({ ageMonths, sex, pregnancy });
    for (const symptom of symptoms) toggleSymptom(symptom);
    stopVoicePrompt();
    router.replace({ pathname: "/(citizen)/questions", params: { voice: "1" } });
  }

  function answerSymptom(isPresent: boolean): void {
    if (!currentSymptom) return;
    const nextSelected = isPresent
      ? [...selectedSymptoms, currentSymptom]
      : selectedSymptoms;
    setSelectedSymptoms(nextSelected);

    if (ageMonths !== null && sex !== null && mostSevereTier(evaluateRedFlags({ patient: { ageMonths, sex, pregnancy }, symptoms: nextSelected, answers: {} }, RULES), RULES) === "EMERGENCY") {
      saveAndShowResult(nextSelected);
      return;
    }

    if (symptomIndex < SYMPTOM_ORDER.length - 1) {
      setSymptomIndex((current) => current + 1);
      return;
    }
    if (nextSelected.length === 0) {
      setStep("NO_SYMPTOMS");
      return;
    }
    saveAndShowResult(nextSelected);
  }

  function restart(): void {
    setAgeInput("");
    setAgeUnit("years");
    setSex(null);
    setPregnancy("no");
    setSymptomIndex(0);
    setSelectedSymptoms([]);
    setStep("INTRO");
  }

  const toolbar = (
    <View style={styles.toolbar}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setVoiceEnabled((enabled) => !enabled)}
        style={styles.toolbarButton}
      >
        <Text style={styles.toolbarLabel}>
          {voiceEnabled ? t("ivr.voice.off") : t("ivr.voice.on")}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={leave} style={styles.toolbarButton}>
        <Text style={styles.toolbarLabel}>{t("ivr.exit")}</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen title={t("ivr.title")}>
      {toolbar}
      {speechFailed ? <Text style={styles.notice}>{t("ivr.voice.failed")}</Text> : null}

      {step === "LANGUAGE" ? (
        <View style={styles.section}>
          <Text style={styles.prompt}>{t("ivr.language.title")}</Text>
          <Text style={styles.help}>{t("ivr.language.help")}</Text>
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("ivr.language.hindi")} onPress={() => chooseLanguage("hi")} />
            <KeyChoice digit="2" label={t("ivr.language.english")} onPress={() => chooseLanguage("en")} />
          </View>
        </View>
      ) : null}

      {step === "INTRO" ? (
        <View style={styles.section}>
          <Card heading={t("ivr.intro.title")}>
            <Text style={styles.body}>{t("ivr.intro.body")}</Text>
          </Card>
          <Card>
            <Text style={styles.safety}>{t("ivr.intro.safety")}</Text>
          </Card>
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("ivr.start")} onPress={() => setStep("AGE")} />
          </View>
        </View>
      ) : null}

      {step === "AGE" ? (
        <View style={styles.section}>
          <Text style={styles.prompt}>{t("ivr.age.title")}</Text>
          <Text style={styles.help}>{t("ivr.age.help")}</Text>
          <TextInput
            accessibilityLabel={t("ivr.age.title")}
            allowFontScaling
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={setAgeInput}
            style={styles.ageInput}
            value={ageInput}
          />
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("ivr.age.years")} onPress={() => setAgeUnit("years")} />
            <KeyChoice digit="2" label={t("ivr.age.months")} onPress={() => setAgeUnit("months")} />
          </View>
          <Text style={styles.selection}>
            {ageUnit === "years" ? t("ivr.age.yearsSelected") : t("ivr.age.monthsSelected")}
          </Text>
          {ageInput.length > 0 && !ageIsValid ? (
            <Text style={styles.notice}>{t("ivr.age.invalid")}</Text>
          ) : null}
          <View style={styles.choices}>
            <KeyChoice digit="3" label={t("action.next")} disabled={!ageIsValid} onPress={moveFromAge} />
          </View>
        </View>
      ) : null}

      {step === "SEX" ? (
        <View style={styles.section}>
          <Text style={styles.prompt}>{t("ivr.sex.title")}</Text>
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("patient.female")} onPress={() => chooseSex("female")} />
            <KeyChoice digit="2" label={t("patient.male")} onPress={() => chooseSex("male")} />
            <KeyChoice digit="3" label={t("ivr.sex.unknown")} onPress={() => chooseSex("unknown")} />
          </View>
        </View>
      ) : null}

      {step === "PREGNANCY" ? (
        <View style={styles.section}>
          <Text style={styles.prompt}>{t("ivr.pregnancy.title")}</Text>
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("patient.pregnancyYes")} onPress={() => choosePregnancy("yes")} />
            <KeyChoice digit="2" label={t("patient.pregnancyNo")} onPress={() => choosePregnancy("no")} />
            <KeyChoice digit="3" label={t("patient.pregnancyUnknown")} onPress={() => choosePregnancy("unknown")} />
          </View>
        </View>
      ) : null}

      {step === "SYMPTOM" && currentSymptom ? (
        <View style={styles.section}>
          <Text style={styles.progress}>
            {t("ivr.progress", { current: symptomIndex + 1, total: SYMPTOM_ORDER.length })}
          </Text>
          <Text style={styles.prompt}>{t(SYMPTOM_PROMPT[currentSymptom])}</Text>
          <View style={styles.choices}>
            <KeyChoice digit="1" label={t("ivr.yes")} onPress={() => answerSymptom(true)} />
            <KeyChoice digit="2" label={t("ivr.no")} onPress={() => answerSymptom(false)} />
            <KeyChoice digit="3" label={t("ivr.repeat")} onPress={repeat} />
          </View>
        </View>
      ) : null}

      {step === "NO_SYMPTOMS" ? (
        <View style={styles.section}>
          <Text style={styles.prompt}>{t("ivr.noSymptoms.title")}</Text>
          <Text style={styles.body}>{t("ivr.noSymptoms.body")}</Text>
          <View style={styles.actions}>
            <Button label={t("action.startOver")} onPress={restart} />
            <Button label={t("ivr.exit")} variant="secondary" onPress={leave} />
          </View>
        </View>
      ) : null}

      {step === "SAVING" ? <Text style={styles.prompt}>{t("ivr.saving")}</Text> : null}

      {step === "SAVE_ERROR" ? (
        <View style={styles.section}>
          <Text style={styles.notice}>{t("error.saveFailed")}</Text>
          <View style={styles.actions}>
            <Button label={t("action.retry")} onPress={() => saveAndShowResult(selectedSymptoms)} />
            <Button label={t("action.startOver")} variant="secondary" onPress={restart} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", justifyContent: "space-between", gap: space.sm, marginBottom: space.lg },
  toolbarButton: { minHeight: touch.min, justifyContent: "center", paddingHorizontal: space.sm },
  toolbarLabel: { ...(type.meta as object), color: ink.body, textDecorationLine: "underline" },
  section: { gap: space.md },
  prompt: { ...(type.title as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  help: { ...(type.body as object), color: ink.body },
  safety: { ...(type.body as object), color: ink.strong, fontWeight: "600" },
  progress: { ...(type.meta as object), color: ink.muted },
  choices: { gap: space.sm },
  keyChoice: {
    minHeight: touch.emergency,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.card,
    backgroundColor: paper.raised,
  },
  keyChoicePressed: { backgroundColor: paper.sunken },
  keyChoiceDisabled: { opacity: 0.45 },
  digitBox: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: ink.strong,
    borderRadius: radius.chip,
  },
  digit: { ...(type.section as object), color: ink.strong },
  choiceLabel: { ...(type.action as object), color: ink.strong, flex: 1 },
  ageInput: {
    minHeight: 72,
    borderWidth: 2,
    borderColor: ink.strong,
    borderRadius: radius.chip,
    backgroundColor: paper.raised,
    color: ink.strong,
    fontSize: 30,
    paddingHorizontal: space.md,
    textAlign: "center",
  },
  selection: { ...(type.meta as object), color: ink.body, textAlign: "center" },
  notice: { ...(type.body as object), color: ink.strong, borderLeftWidth: 4, borderLeftColor: ink.strong, paddingLeft: space.sm },
  actions: { gap: space.sm, marginTop: space.md },
});
