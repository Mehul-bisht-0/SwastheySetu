import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { FreshnessChip } from "../../src/ui/FreshnessChip.tsx";
import { getReport } from "../../src/db/dao/reports.ts";
import { rankOffline } from "../../src/db/dao/facilities.ts";
import { requiredCapability } from "@swasthyasetu/core";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";
import type { RankedFacility } from "@swasthyasetu/core";

export default function FacilitiesScreen(): React.ReactNode {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [facilities, setFacilities] = useState<RankedFacility[]>([]);

  useEffect(() => {
    if (!reportId) return;
    const report = getReport(reportId);
    if (!report) return;
    const result = report.result;
    const requirement = requiredCapability(result.tier, report.encounter.patient);
    const ranked = rankOffline({
      near: { lat: 25.13, lon: 85.6 },
      radiusKm: 25,
      requirement,
      tier: result.tier,
    });
    setFacilities(ranked);
  }, [reportId]);

  if (facilities.length === 0) {
    return (
      <Screen title={t("facilities.title")}>
        <Text style={styles.empty}>{t("facilities.empty")}</Text>
      </Screen>
    );
  }

  return (
    <Screen title={t("facilities.title")} scroll={false}>
      <FlatList
        data={facilities}
        keyExtractor={(f) => f.facility.facilityId}
        contentContainerStyle={{ padding: space.sm }}
        renderItem={({ item }) => {
          const f = item.facility;
          const km = Math.round(f.distanceMeters / 100) / 10;
          return (
            <Card>
              <Text style={styles.name}>{f.name}</Text>
              <Text style={styles.distance}>{t("facilities.distance", { km })}</Text>
              <FreshnessChip band={item.freshness.band} lastConfirmedAt={f.lastConfirmedAt} lastReportedClosedAt={f.lastNegativeAt} />
              <View style={styles.actions}>
                {f.phone && (
                  <Button label={t("facilities.call")} variant="secondary" onPress={() => Linking.openURL("tel:" + f.phone)} />
                )}
                <Button
                  label={t("facilities.directions")}
                  variant="secondary"
                  onPress={() => Linking.openURL("https://www.google.com/maps/dir/?api=1&destination=" + f.latitude + "," + f.longitude)}
                />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { ...(type.body as object), color: ink.muted, textAlign: "center", padding: space.lg },
  name: { ...(type.section as object), color: ink.strong, marginBottom: space.xs },
  distance: { ...(type.meta as object), color: ink.muted, marginBottom: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
