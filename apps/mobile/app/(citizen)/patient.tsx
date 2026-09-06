import React, { useState } from "react";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field, Choice } from "../../src/ui/Field.tsx";
import { StepIndicator } from "../../src/ui/StepIndicator.tsx";
import { setPatient } from "../../src/state/triageDraft.ts";
import { t } from "../../src/i18n/strings.ts";

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

  const ageIsValid = ageMonths !== null && ageMonths <= 1440;
  const showPregnancy = sex === "female" && ageIsValid && ageMonths >= 144 && ageMonths <= 600;
  const canContinue = ageIsValid && sex !== null;

  function onContinue() {
    if (!ageIsValid || ageMonths === null || sex === null) return;
    const preg = showPregnancy ? (pregnancy ?? "unknown") : "no";
    setPatient({ ageMonths, sex, pregnancy: preg });
    router.push("/(citizen)/symptoms");
  }

  return (
    <Screen title={t("patient.title")} onBack={() => router.back()} footer={
      <Button label={t("action.next")} onPress={onContinue} disabled={!canContinue} />
    }>
      <StepIndicator current={1} total={3} label={t("patient.title")} showLabel={false} />
      <Field
        label={t("patient.age")}
        value={ageStr}
        onChange={setAgeStr}
        keyboardType="number-pad"
        error={ageStr && !ageIsValid ? t("ivr.age.invalid") : undefined}
      />
      <Choice
        value={useMonths ? "months" : "years"}
        onChange={(value) => setUseMonths(value === "months")}
        options={[
          { value: "years", label: t("ivr.age.years") },
          { value: "months", label: t("ivr.age.months") },
        ]}
      />
      <Choice label={t("patient.sex")} value={sex} onChange={setSex} options={[{ value: "female" as const, label: t("patient.female") }, { value: "male" as const, label: t("patient.male") }]} />
      {showPregnancy && (
        <Choice stacked label={t("patient.pregnancy")} value={pregnancy} onChange={setPregnancy} options={[
          { value: "yes" as const, label: t("patient.pregnancyYes") },
          { value: "no" as const, label: t("patient.pregnancyNo") },
          { value: "unknown" as const, label: t("patient.pregnancyUnknown"), help: t("patient.pregnancyUnknownHelp") },
        ]} />
      )}
    </Screen>
  );
}
