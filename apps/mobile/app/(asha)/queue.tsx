import React, { useState, useEffect } from "react";
import { View, Text, FlatList } from "react-native";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { runSync, subscribe } from "../../src/sync/runner.ts";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";
import type { SyncState } from "../../src/sync/runner.ts";
import { listVisits } from "../../src/db/dao/visits.ts";

export default function QueueScreen(): React.ReactNode {
  const [state, setState] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribe(setState), []);
  async function onSend() {
    setBusy(true);
    await runSync("manual");
    setBusy(false);
  }
  if (!state) return <Screen title={t("asha.home.queue")}><Text style={{ color: ink.muted }}>Loading...</Text></Screen>;
  return (
    <Screen title={t("sync.queued", { n: state.pending })} footer={state.pending > 0 ? <Button label={t("sync.sendNow")} onPress={onSend} busy={busy} /> : undefined}>
      {state.pending === 0 && state.rejected === 0 && <Text style={{ color: ink.muted, textAlign: "center" }}>{t("sync.empty")}</Text>}
      {state.pending > 0 && <Text style={{ marginBottom: space.sm, color: ink.body }}>{t("sync.queued", { n: state.pending })}</Text>}
      {state.rejected > 0 && <Text style={{ color: "#8F1D14", marginBottom: space.sm }}>{t("sync.failed", { n: state.rejected })}</Text>}
      {state.lastError ? <Text style={{ color: ink.strong }}>{t("error.serverUnreachable")}</Text> : null}
      {listVisits({ limit: 1000 }).filter(visit => visit.conflict).map(visit => (
        <Text key={visit.visitId} style={{ color: ink.strong }}>{visit.householdCode}: {t("asha.home.conflict")}</Text>
      ))}
    </Screen>
  );
}
