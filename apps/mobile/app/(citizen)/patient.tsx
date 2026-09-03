import React, { useState } from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field, Choice } from "../../src/ui/Field.tsx";
import { setPatient, toEncounter } from "../../src/state/triageDraft.ts";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";

export default function PatientScreen(): React.ReactNode {
  const router = useRouter();
  const [ageStr, setAgeStr] = useState("");
  const [useMonths, setUseMonths] = useState(false);
  const [sex, setSex] = useState<"male" | "female" | null>(null);
  const [pregnancy, setPregnancy] = useState<"yes" | "no" | "unknown" | null>(null);

  const ageNum = parseInt(ageStr, 10);
  const ageMonths = Number.isFinite(ageNum) && ageNum >= 0
    ? (useMonths ? ageNum : ageNum * 12)
    : null;

  const showPregnancy = sex === "female" && ageMonths !== null && ageMonths >= 144 && ageMonths <= 600;
  const canContinue = ageMonths !== null && sex !== null;

  function onContinue() {
    if (ageMonths === null || sex === null) return;
    const preg = showPregnancy ? (pregnancy ?? "unknown") : "no";
    setPatient({ ageMonths, sex, pregnancy: preg });
    router.push("/(citizen)/symptoms");
  }

  return (
    <Screen title={t("patient.title")} footer={
      <Button label={t("action.next")} onPress={onContinue} disabled={!canContinue} />
    }>
      <View style={styles.row}>
        <View style={styles.ageInput}>
          <Field label={t("patient.age")} value={ageStr} onChange={setAgeStr} keyboardType="number-pad"
            error={ageStr && !Number.isFinite(ageNum) ? "Enter a number" : undefined} />
        </View>
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>{useMonths ? t("patient.ageMonths") : t("patient.ageYears")}</Text>
          <Switch value={useMonths} onValueChange={setUseMonths} accessibilityLabel="Switch between years and months" />
        </View>
      </View>
      <Choice label={t("patient.sex")} value={sex} onChange={setSex} options={[{ value: "female" as const, label: t("patient.female") }, { value: "male" as const, label: t("patient.male") }]} />
      {showPregnancy && (
        <Choice label={t("patient.pregnancy")} value={pregnancy} onChange={setPregnancy} options={[
          { value: "yes" as const, label: t("patient.pregnancyYes") },
          { value: "no" as const, label: t("patient.pregnancyNo") },
          { value: "unknown" as const, label: t("patient.pregnancyUnknown"), help: t("patient.pregnancyUnknownHelp") },
        ]} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  ageInput: { flex: 1 },
  toggle: { alignItems: "center", marginBottom: space.md, gap: 4 },
  toggleLabel: { ...(type.meta as object), color: ink.muted },
});
