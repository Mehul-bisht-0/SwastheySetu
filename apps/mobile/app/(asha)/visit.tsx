import React, { useState } from "react";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { upsertVisit } from "../../src/db/dao/visits.ts";
import { getSession } from "../../src/state/session.ts";
import { t } from "../../src/i18n/strings.ts";
import { View, Text, Alert } from "react-native";

export default function VisitScreen(): React.ReactNode {
  const router = useRouter();
  const [household, setHousehold] = useState("");
  const [notes, setNotes] = useState("");
  function onSave() {
    const session = getSession();
    if (!session) return;
    upsertVisit({ householdCode: household, villageId: "village-mock", visitedAt: new Date().toISOString(), payload: { notes } });
    Alert.alert("", t("asha.visit.saved"));
    router.back();
  }
  return (
    <Screen title={t("asha.visit.title")} footer={<Button label={t("asha.visit.save")} onPress={onSave} disabled={!household} />}>
      <Field label={t("asha.visit.household")} value={household} onChange={setHousehold} help={t("asha.visit.householdHelp")} />
      <Field label={t("asha.visit.notes")} value={notes} onChange={setNotes} />
    </Screen>
  );
}
