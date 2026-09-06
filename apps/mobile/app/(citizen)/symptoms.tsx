import React, { useState, useEffect } from "react";
import { View, FlatList, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { SymptomTile } from "../../src/ui/SymptomTile.tsx";
import { toggleSymptom, getDraft } from "../../src/state/triageDraft.ts";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";
import type { SymptomCode } from "@swasthyasetu/core";

// Danger signs first — someone whose child is convulsing must not have to scroll
const SYMPTOM_ORDER: SymptomCode[] = [
  "UNCONSCIOUS", "CONVULSION", "FAST_BREATHING", "BLEEDING_HEAVY",
  "NOT_FEEDING", "FEVER", "COUGH", "DIARRHOEA", "VOMITING",
  "CHEST_PAIN", "WEAKNESS_ONE_SIDE", "DIFFICULTY_SPEAKING",
  "BLURRED_VISION", "SWELLING_FACE_HANDS", "REDUCED_FETAL_MOVEMENT",
  "SEVERE_ABDOMINAL_PAIN", "RASH", "INJURY", "BURNING_URINATION",
];

const SYMPTOM_LABELS: Record<SymptomCode, string> = {
  UNCONSCIOUS: "Not waking up", CONVULSION: "Fits / seizures", FAST_BREATHING: "Fast or difficult breathing",
  BLEEDING_HEAVY: "Heavy bleeding", NOT_FEEDING: "Not eating or drinking", FEVER: "Fever",
  COUGH: "Cough", DIARRHOEA: "Loose stools", VOMITING: "Vomiting", CHEST_PAIN: "Chest pain",
  WEAKNESS_ONE_SIDE: "Sudden weakness on one side", DIFFICULTY_SPEAKING: "Sudden speech difficulty",
  BLURRED_VISION: "Blurred vision", SWELLING_FACE_HANDS: "Face or hand swelling",
  REDUCED_FETAL_MOVEMENT: "Baby moving less", SEVERE_ABDOMINAL_PAIN: "Severe stomach pain",
  RASH: "Rash or spots", INJURY: "Injury", BURNING_URINATION: "Burning urination",
};

// Ensure even grid layout by adding a spacer slot if the symptom count is odd
const GRID_DATA: (SymptomCode | null)[] =
  SYMPTOM_ORDER.length % 2 === 0
    ? SYMPTOM_ORDER
    : [...SYMPTOM_ORDER, null];

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
      footer={
        <Button
          label={t("symptoms.continue")}
          onPress={() => router.push("/(citizen)/questions")}
          disabled={!canContinue}
        />
      }
    >
      <Text style={styles.hint}>
        {canContinue ? t("symptoms.help") : t("symptoms.none")}
      </Text>
      <FlatList
        data={GRID_DATA}
        keyExtractor={(c, idx) => c ?? `placeholder-${idx}`}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (!item) {
            return <View style={styles.tilePlaceholder} />;
          }
          return (
            <SymptomTile
              code={item}
              label={SYMPTOM_LABELS[item] ?? item}
              selected={selected.has(item)}
              onToggle={() => toggle(item)}
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...(type.body as object),
    color: ink.muted,
    textAlign: "center",
    marginBottom: space.sm,
  },
  listContent: {
    paddingBottom: space.lg,
  },
  columnWrapper: {
    gap: space.sm,
    marginBottom: space.sm,
  },
  tilePlaceholder: {
    flex: 1,
    minHeight: 100,
    backgroundColor: "transparent",
  },
});
