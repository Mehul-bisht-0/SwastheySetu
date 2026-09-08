import React, { useState } from "react";
import { FlatList, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { SymptomTile } from "../../src/ui/SymptomTile.tsx";
import { StepIndicator } from "../../src/ui/StepIndicator.tsx";
import { toggleSymptom, getDraft } from "../../src/state/triageDraft.ts";
import { t } from "../../src/i18n/strings.ts";
import type { StringKey } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";
import type { SymptomCode } from "@swasthyasetu/core";
import { safeBack } from "../../src/navigation/safeBack.ts";

// Danger signs first — someone whose child is convulsing must not have to scroll
const SYMPTOM_ORDER: SymptomCode[] = [
  "UNCONSCIOUS", "CONVULSION", "FAST_BREATHING", "BLEEDING_HEAVY",
  "NOT_FEEDING", "FEVER", "COUGH", "DIARRHOEA", "VOMITING",
  "CHEST_PAIN", "WEAKNESS_ONE_SIDE", "DIFFICULTY_SPEAKING",
  "BLURRED_VISION", "SWELLING_FACE_HANDS", "REDUCED_FETAL_MOVEMENT",
  "SEVERE_ABDOMINAL_PAIN", "RASH", "INJURY", "BURNING_URINATION",
];

const SYMPTOM_LABELS: Record<SymptomCode, StringKey> = {
  UNCONSCIOUS: "ivr.symptom.UNCONSCIOUS", CONVULSION: "ivr.symptom.CONVULSION", FAST_BREATHING: "ivr.symptom.FAST_BREATHING",
  BLEEDING_HEAVY: "ivr.symptom.BLEEDING_HEAVY", NOT_FEEDING: "ivr.symptom.NOT_FEEDING", FEVER: "ivr.symptom.FEVER",
  COUGH: "ivr.symptom.COUGH", DIARRHOEA: "ivr.symptom.DIARRHOEA", VOMITING: "ivr.symptom.VOMITING", CHEST_PAIN: "ivr.symptom.CHEST_PAIN",
  WEAKNESS_ONE_SIDE: "ivr.symptom.WEAKNESS_ONE_SIDE", DIFFICULTY_SPEAKING: "ivr.symptom.DIFFICULTY_SPEAKING",
  BLURRED_VISION: "ivr.symptom.BLURRED_VISION", SWELLING_FACE_HANDS: "ivr.symptom.SWELLING_FACE_HANDS",
  REDUCED_FETAL_MOVEMENT: "ivr.symptom.REDUCED_FETAL_MOVEMENT", SEVERE_ABDOMINAL_PAIN: "ivr.symptom.SEVERE_ABDOMINAL_PAIN",
  RASH: "ivr.symptom.RASH", INJURY: "ivr.symptom.INJURY", BURNING_URINATION: "ivr.symptom.BURNING_URINATION",
};

export default function SymptomsScreen(): React.ReactNode {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<SymptomCode>>(() => new Set(getDraft().symptoms));

  function toggle(code: SymptomCode) {
    toggleSymptom(code);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  const canContinue = selected.size > 0;

  return (
    <Screen
      title={t("symptoms.title")}
      scroll={false}
      onBack={() => safeBack(router, "/(patient)/home")}
      footer={
        <Button
          label={t("symptoms.continue")}
          onPress={() => router.push("/(citizen)/questions")}
          disabled={!canContinue}
        />
      }
    >
      <StepIndicator current={2} total={3} label={t("symptoms.title")} showLabel={false} />
      <Text style={styles.hint}>{t("symptoms.help")}</Text>
      <FlatList
        data={SYMPTOM_ORDER}
        keyExtractor={(code) => code}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SymptomTile
            code={item}
            label={t(SYMPTOM_LABELS[item])}
            selected={selected.has(item)}
            onToggle={() => toggle(item)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...(type.body as object),
    color: ink.body,
    marginBottom: space.md,
  },
  listContent: {
    paddingBottom: space.lg,
  },
});
