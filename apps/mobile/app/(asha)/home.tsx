import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { refreshAshaVillages } from "../../src/api/asha.ts";
import { listVillages, type VillageRow } from "../../src/db/dao/villages.ts";
import { listVisits, type VisitRow } from "../../src/db/dao/visits.ts";
import { t, getLocale } from "../../src/i18n/strings.ts";
import { getSession, signOut } from "../../src/state/session.ts";
import { ink, space, system, type } from "../../src/theme/tokens.ts";
import { Button } from "../../src/ui/Button.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { Screen } from "../../src/ui/Screen.tsx";

export default function HomeScreen(): React.ReactNode {
  const router = useRouter();
  const session = getSession();
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [villages, setVillages] = useState<VillageRow[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadLocal = () => {
      if (!active) return;
      setVisits(listVisits({ limit: 10 }));
      setVillages(listVillages(session?.districtCode));
    };
    loadLocal();
    void refreshAshaVillages().then(loadLocal);
    return () => { active = false; };
  }, [session?.districtCode]));

  const villageNames = new Map(villages.map((village) => [village.villageId, village.name]));

  async function leaveWorkerSession(): Promise<void> {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen title={t("asha.home.title")}>
      <View style={styles.actions}>
        {session?.role === "SUPERVISOR" || session?.role === "ADMIN"
          ? <Button label="Facility emergency alerts (demo)" onPress={() => router.push("/(asha)/dispatch")} />
          : null}
        <Button label={getLocale() === 'hi' ? 'केस इनबॉक्स' : 'Case inbox'} onPress={() => router.push('./inbox')} />
        <Button label={t("asha.home.newVisit")} onPress={() => router.push("/(asha)/visit")} />
        <Button label={t("asha.home.queue")} variant="secondary" onPress={() => router.push("/(asha)/queue")} />
      </View>

      <Text style={styles.section}>{t("asha.home.recentVisits")}</Text>
      {visits.length === 0 ? <Text style={styles.empty}>{t("asha.home.noVisits")}</Text> : null}
      {visits.map((visit) => {
        const status = visit.conflict
          ? t("asha.home.conflict")
          : visit.pending ? t("asha.home.pending") : t("asha.home.sent");
        return (
          <Card key={visit.visitId} heading={visit.householdCode}>
            <Text style={styles.body}>{villageNames.get(visit.villageId) ?? visit.villageId}</Text>
            <Text style={styles.meta}>{new Date(visit.visitedAt).toLocaleString()}</Text>
            <Text style={[styles.status, visit.conflict && styles.failed]}>{status}</Text>
          </Card>
        );
      })}
      <Button
        label={getLocale() === "hi" ? "साइन आउट करें" : "Sign out"}
        variant="secondary"
        onPress={() => void leaveWorkerSession()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginBottom: space.lg },
  section: { ...(type.section as object), color: ink.strong, marginBottom: space.sm },
  empty: { ...(type.body as object), color: ink.muted },
  body: { ...(type.body as object), color: ink.body },
  meta: { ...(type.meta as object), color: ink.muted, marginTop: space.xs },
  status: { ...(type.meta as object), color: ink.body, marginTop: space.sm },
  failed: { color: system.failed },
});
