import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  evaluateRedFlags,
  evaluateTriage,
  mostSevereTier,
  RULES,
} from "@swasthyasetu/core";
import type { Encounter } from "@swasthyasetu/core";

import { saveReport } from "../../src/db/dao/reports.ts";
import { getLocale, t } from "../../src/i18n/strings.ts";
import { stopVoicePrompt, useVoicePrompt } from "../../src/ivr/useVoicePrompt.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";
import { getDraft, replaceEncounter } from "../../src/state/triageDraft.ts";
import { accent, ink, paper, radius, space, touch, type } from "../../src/theme/tokens.ts";
import {
  buildEncounter,
  decodeMulti,
  encodeMulti,
  extractIntakeAnswers,
  localizeOption,
  localizeQuestion,
  pruneAfter,
  QUESTION_COUNT,
  questionAt,
  shouldEndIntakeForRedFlag,
} from "../../src/ivr/questionnaire.ts";
import type {
  IntakeAnswers,
  IntakeLocale,
  IntakeOption,
  IntakeQuestion,
} from "../../src/ivr/questionnaire.ts";
import { Button } from "../../src/ui/Button.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { Screen } from "../../src/ui/Screen.tsx";
import { StepIndicator } from "../../src/ui/StepIndicator.tsx";

function ChoiceButton(props: {
  option: IntakeOption;
  selected: boolean;
  locale: IntakeLocale;
  onPress: () => void;
  prefix?: string;
}): React.ReactNode {
  const label = localizeOption(props.option, props.locale);
  return (
    <Pressable
      accessibilityRole={props.selected ? "checkbox" : "button"}
      accessibilityState={{ checked: props.selected }}
      accessibilityLabel={label}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.choice,
        props.selected && styles.choiceSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <Text style={styles.choiceMark}>{props.selected ? "●" : "○"}</Text>
      <Text style={[styles.choiceLabel, props.selected && styles.choiceLabelSelected]}>
        {props.prefix ? `${props.prefix}. ` : ""}{label}
      </Text>
    </Pressable>
  );
}

function spokenText(question: IntakeQuestion | null, locale: IntakeLocale): string {
  if (!question) return "";
  const prompt = localizeQuestion(question, locale);
  const options = question.options
    ?.map((option, index) => `${index + 1}. ${localizeOption(option, locale)}`)
    .join(". ");
  return options ? `${prompt} ${options}` : prompt;
}

export default function QuestionsScreen(): React.ReactNode {
  const router = useRouter();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const locale = getLocale();
  const initial = useMemo(() => getDraft(), []);
  const patient = initial.patient;
  const seedSymptoms = useRef([...initial.symptoms]);
  const [number, setNumber] = useState(1);
  const [responses, setResponses] = useState<IntakeAnswers>(() => extractIntakeAnswers(initial.answers));
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [numeric, setNumeric] = useState("");
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours" | "days" | "weeks">("hours");
  const [error, setError] = useState(false);
  const saving = useRef(false);

  const question = useMemo(
    () => patient ? questionAt(number, patient, responses) : null,
    [number, patient, responses],
  );
  const prompt = question ? localizeQuestion(question, locale) : "";
  const { repeat } = useVoicePrompt(spokenText(question, locale), locale, voice === "1");

  useEffect(() => {
    if (!patient) router.replace("/(citizen)/patient");
  }, [patient, router]);

  useEffect(() => {
    if (!question) return;
    const existing = responses[question.id];
    if (question.kind === "multi") setMultiValues(decodeMulti(existing));
    if (question.kind === "number") setNumeric(typeof existing === "number" ? String(existing) : "");
    if (question.kind === "duration") {
      if (typeof existing === "string") {
        const [amount, unit] = existing.split("|");
        setNumeric(amount ?? "");
        if (unit === "minutes" || unit === "hours" || unit === "days" || unit === "weeks") {
          setDurationUnit(unit);
        }
      } else {
        setNumeric("");
        setDurationUnit("hours");
      }
    }
  }, [question?.id, question?.kind, responses]);

  function finish(encounter: Encounter): void {
    if (saving.current) return;
    saving.current = true;
    setError(false);
    try {
      replaceEncounter(encounter);
      const result = evaluateTriage(encounter, { clock: { now: () => new Date() } });
      const reportId = saveReport({ villageId: null, encounter, result });
      stopVoicePrompt();
      router.replace({
        pathname: "/(citizen)/result",
        params: { reportId, ...(voice === "1" ? { voice: "1" } : {}) },
      });
    } catch {
      saving.current = false;
      setError(true);
    }
  }

  function commit(value: string | number): void {
    if (!patient || !question) return;
    const pruned = pruneAfter(responses, number);
    const nextResponses: IntakeAnswers = { ...pruned, [question.id]: value };
    const encounter = buildEncounter(patient, nextResponses, seedSymptoms.current);
    setResponses(nextResponses);
    replaceEncounter(encounter);

    const redTier = mostSevereTier(evaluateRedFlags(encounter, RULES), RULES);
    if (shouldEndIntakeForRedFlag(redTier, number)) {
      finish(encounter);
      return;
    }
    if (number === QUESTION_COUNT) {
      finish(encounter);
      return;
    }
    setNumber((current) => current + 1);
  }

  function toggleMulti(value: string): void {
    setMultiValues((current) => {
      if (value === "none") return current.includes("none") ? [] : ["none"];
      const withoutNone = current.filter((candidate) => candidate !== "none");
      return withoutNone.includes(value)
        ? withoutNone.filter((candidate) => candidate !== value)
        : [...withoutNone, value];
    });
  }

  function goBack(): void {
    if (number > 1) {
      setNumber((current) => current - 1);
      return;
    }
    safeBack(router, "/(citizen)/patient");
  }

  const numberIsValid = /^\d+$/.test(numeric)
    && Number(numeric) >= 0
    && Number(numeric) <= (question?.max ?? 3650);

  if (!patient || !question) return <Screen><Text style={styles.help}>Loading…</Text></Screen>;

  return (
    <Screen
      title={locale === "mr" ? "लक्षण तपासणी" : locale === "hi" ? "लक्षण जाँच" : "Symptom check"}
      onBack={goBack}
    >
      <View style={styles.container}>
        <StepIndicator
          current={number}
          total={QUESTION_COUNT}
          label={t("ivr.progress", { current: number, total: QUESTION_COUNT })}
        />
        <Text style={styles.prompt}>{prompt}</Text>
        {number === 1 ? (
          <Text style={styles.help}>
            {locale === "mr"
              ? "धोक्याचे लक्षण निवडल्यास तपासणी लगेच सल्ला दाखवेल."
              : locale === "hi"
              ? "अगर कोई खतरनाक लक्षण चुना जाता है, तो जाँच तुरंत सलाह दिखाएगी।"
              : "If a danger sign is selected, the check will show advice immediately."}
          </Text>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{t("error.saveFailed")}</Text>
            <Button
              label={t("action.retry")}
              onPress={() => finish(buildEncounter(patient, responses, seedSymptoms.current))}
            />
          </View>
        ) : null}

        {question.kind === "single" ? (
          <View style={styles.options}>
            {question.options?.map((option, index) => (
              <ChoiceButton
                key={option.value}
                option={option}
                selected={responses[question.id] === option.value}
                locale={locale}
                prefix={String(index + 1)}
                onPress={() => commit(option.value)}
              />
            ))}
          </View>
        ) : null}

        {question.kind === "multi" ? (
          <View style={styles.options}>
            {question.options?.map((option, index) => (
              <ChoiceButton
                key={option.value}
                option={option}
                selected={multiValues.includes(option.value)}
                locale={locale}
                prefix={String(index + 1)}
                onPress={() => toggleMulti(option.value)}
              />
            ))}
            <Button
              label={t("action.next")}
              disabled={multiValues.length === 0}
              onPress={() => commit(encodeMulti(multiValues))}
            />
          </View>
        ) : null}

        {question.kind === "number" ? (
          <View style={styles.options}>
            <Field
              value={numeric}
              onChange={setNumeric}
              keyboardType="number-pad"
              help={locale === "mr" ? "० ते १० मधील संख्या लिहा." : locale === "hi" ? "0 से 10 तक संख्या लिखें।" : "Enter a number from 0 to 10."}
            />
            <Button
              label={t("action.next")}
              disabled={!numberIsValid}
              onPress={() => commit(Number(numeric))}
            />
          </View>
        ) : null}

        {question.kind === "duration" ? (
          <View style={styles.options}>
            <Field
              value={numeric}
              onChange={setNumeric}
              keyboardType="number-pad"
              help={locale === "mr" ? "संख्या लिहा आणि वेळेचे एकक निवडा." : locale === "hi" ? "संख्या लिखें और समय की इकाई चुनें।" : "Enter a number and choose the time unit."}
            />
            <View style={styles.unitRow}>
              {(["minutes", "hours", "days", "weeks"] as const).map((unit) => (
                <Pressable
                  key={unit}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: durationUnit === unit }}
                  onPress={() => setDurationUnit(unit)}
                  style={[styles.unit, durationUnit === unit && styles.unitSelected]}
                >
                  <Text style={[styles.unitLabel, durationUnit === unit && styles.choiceLabelSelected]}>
                    {locale === "mr"
                      ? ({ minutes: "मिनिटे", hours: "तास", days: "दिवस", weeks: "आठवडे" } as const)[unit]
                      : locale === "hi"
                      ? ({ minutes: "मिनट", hours: "घंटे", days: "दिन", weeks: "हफ़्ते" } as const)[unit]
                      : unit}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button
              label={t("action.next")}
              disabled={!numberIsValid}
              onPress={() => commit(`${Number(numeric)}|${durationUnit}`)}
            />
          </View>
        ) : null}

        {voice === "1" ? (
          <Button label={t("ivr.repeat")} variant="secondary" onPress={repeat} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  prompt: { ...(type.section as object), color: ink.strong },
  help: { ...(type.body as object), color: ink.body },
  options: { gap: space.sm },
  choice: {
    minHeight: touch.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.chip,
    backgroundColor: paper.raised,
    padding: space.sm,
  },
  choiceSelected: { borderWidth: 2, borderColor: accent, backgroundColor: paper.sunken },
  choicePressed: { opacity: 0.72 },
  choiceMark: { ...(type.section as object), color: ink.strong },
  choiceLabel: { ...(type.body as object), color: ink.body, flex: 1 },
  choiceLabelSelected: { color: ink.strong, fontWeight: "700" },
  unitRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  unit: {
    minHeight: touch.min,
    minWidth: 76,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.chip,
    backgroundColor: paper.raised,
    padding: space.sm,
  },
  unitSelected: { borderWidth: 2, borderColor: accent, backgroundColor: paper.sunken },
  unitLabel: { ...(type.body as object), color: ink.body, textTransform: "capitalize" },
  errorBox: { gap: space.sm, borderWidth: 1, borderColor: ink.strong, padding: space.sm },
  errorText: { ...(type.body as object), color: ink.strong },
});
