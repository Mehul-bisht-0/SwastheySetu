/** Collect existing rule inputs in tap or spoken mode. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { evaluateTriage, evaluateRedFlags, mostSevereTier, RULES } from "@swasthyasetu/core";
import type { AnswerValue } from "@swasthyasetu/core";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { answer, toEncounter } from "../../src/state/triageDraft.ts";
import { saveReport } from "../../src/db/dao/reports.ts";
import { getLocale, t } from "../../src/i18n/strings.ts";
import { followUpQuestions } from "../../src/ivr/followUp.ts";
import { useVoicePrompt, stopVoicePrompt } from "../../src/ivr/useVoicePrompt.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";

export default function QuestionsScreen(): React.ReactNode {
  const router = useRouter();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const locale = getLocale();
  const [index, setIndex] = useState(0);
  const [numeric, setNumeric] = useState("");
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const initial = useMemo(() => toEncounter(), []);
  const questions = useMemo(() => initial ? followUpQuestions(initial) : [], [initial]);
  const question = questions[index];
  const prompt = question ? question[locale] : "";
  const { repeat } = useVoicePrompt(prompt, locale, voice === "1");
  function finish(): void {
    if (saving.current) return;
    const encounter = toEncounter();
    if (!encounter) { router.replace("/(citizen)/patient"); return; }
    saving.current = true;
    try {
      const result = evaluateTriage(encounter, { clock: { now: () => new Date() } });
      const reportId = saveReport({ villageId: null, encounter, result });
      stopVoicePrompt();
      router.replace({ pathname: "/(citizen)/result", params: { reportId, ...(voice === "1" ? { voice: "1" } : {}) } });
    } catch { saving.current = false; setError(true); }
  }
  useEffect(() => {
    if (!initial || mostSevereTier(evaluateRedFlags(initial, RULES), RULES) === "EMERGENCY") finish();
  }, []);
  function choose(value: AnswerValue | undefined): void {
    if (!question) return;
    answer(question.id, value);
    const encounter = toEncounter();
    if (encounter && (mostSevereTier(evaluateRedFlags(encounter, RULES), RULES) === "EMERGENCY" || index === questions.length - 1)) { finish(); return; }
    setNumeric("");
    setIndex(i => i + 1);
  }
  const validNumber = /^\d+$/.test(numeric) && Number(numeric) <= (question?.max ?? 0);
  return (
    <Screen title={locale === "hi" ? "कुछ और सवाल" : "Follow-up questions"}>
      {error ? (
        <View style={styles.container}>
          <Text style={styles.errorText}>{t("error.saveFailed")}</Text>
          <Button label={t("action.retry")} onPress={finish} />
        </View>
      ) : question ? (
        <View style={styles.container}>
          <Text style={styles.prompt}>{prompt}</Text>
          {question.options ? (
            <View style={styles.buttonGroup}>
              {question.options.map((option, i) => (
                <Button
                  key={String(option.value)}
                  label={`${i + 1}. ${option[locale]}`}
                  onPress={() => choose(option.value)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <Field
                value={numeric}
                onChange={setNumeric}
                keyboardType="number-pad"
              />
              <Button
                label={t("action.next")}
                disabled={!validNumber}
                onPress={() => choose(Number(numeric))}
              />
            </View>
          )}
          <Button
            label={t("patient.pregnancyUnknown")}
            variant="secondary"
            onPress={() => choose(undefined)}
          />
          {voice === "1" ? (
            <Button
              label={t("ivr.repeat")}
              variant="secondary"
              onPress={repeat}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  buttonGroup: {
    gap: space.sm,
  },
  prompt: {
    ...(type.section as object),
    color: ink.strong,
    marginBottom: space.xs,
  },
  errorText: {
    ...(type.body as object),
    color: ink.strong,
  },
});
