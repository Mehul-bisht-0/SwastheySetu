import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Choice } from "../../src/ui/Field.tsx";
import { answer, toEncounter, getDraft } from "../../src/state/triageDraft.ts";
import { saveReport } from "../../src/db/dao/reports.ts";
import { evaluateTriage } from "@swasthyasetu/core";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";

// Phase 7 MVP: no follow-up questions. All triages run on patient + symptoms only.
// Phase 8: conditional follow-up questions can appear here when needed.
export default function QuestionsScreen(): React.ReactNode {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    setBusy(true);
    const enc = toEncounter();
    if (!enc) { setBusy(false); return; }
    const result = evaluateTriage(enc, { clock: { now: () => new Date() } });
    const reportId = saveReport({ villageId: null, encounter: enc, result });
    setBusy(false);
    router.push({ pathname: "/(citizen)/result", params: { reportId } });
  }

  return (
    <Screen
      title="Follow-up questions"
      footer={<Button label={t("action.next")} onPress={onContinue} busy={busy} />}
    >
      <Text style={styles.placeholder}>No additional questions needed. Tap Next to see your result.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: { ...(type.body as object), color: ink.muted, textAlign: "center", padding: space.lg },
});
