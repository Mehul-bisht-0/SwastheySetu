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
import type { RankingOutcome } from "@swasthyasetu/core";
import * as Location from "expo-location";
import { getLocale } from "../../src/i18n/strings.ts";
import { listVillages } from "../../src/db/dao/villages.ts";

export default function FacilitiesScreen(): React.ReactNode {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [outcome, setOutcome] = useState<RankingOutcome | null>(null);
  const [near, setNear] = useState<{ lat: number; lon: number } | null>(null);
  const [villageId, setVillageId] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const hindi = getLocale() === "hi";

  async function locate(): Promise<void> {
    setLocating(true);
    setLocationError(false);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { setLocationError(true); return; }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Location timeout")), 15000); }),
      ]);
      setVillageId(undefined);
      setNear({ lat: position.coords.latitude, lon: position.coords.longitude });
    } catch { setLocationError(true); }
    finally { if (timeout) clearTimeout(timeout); setLocating(false); }
  }

  useEffect(() => {
    if (!reportId || !near) return;
    const report = getReport(reportId);
    if (!report) return;
    const result = report.result;
    const requirement = requiredCapability(report.encounter, result);
    const ranked = rankOffline({
      near,
      villageId,
      radiusKm: 25,
      requirement,
      tier: result.tier,
    });
    setOutcome(ranked);
  }, [reportId, near, villageId]);

  const facilities = outcome?.results ?? [];

  if (!near) return (
    <Screen title={t("facilities.title")}>
      <Text style={styles.callFirst}>{hindi ? "नज़दीकी केंद्रों की दूरी के लिए अपनी जगह साझा करें।" : "Share your location to calculate distances to nearby facilities."}</Text>
      <Button label={hindi ? "मेरी जगह का उपयोग करें" : "Use my location"} busy={locating} onPress={locate} />
      {locationError ? <Text style={styles.empty}>{hindi ? "जगह नहीं मिल सकी। फ़ोन की लोकेशन चालू करके फिर कोशिश करें।" : "Could not get your location. Enable device location and try again."}</Text> : null}
      {listVillages().length > 0 ? <Text style={styles.callFirst}>{hindi ? "या अपना गाँव चुनें।" : "Or choose your village."}</Text> : null}
      {listVillages().map(village => <Button key={village.villageId} label={village.name} variant="secondary" onPress={() => {
        setVillageId(village.villageId);
        setNear({ lat: village.latitude, lon: village.longitude });
      }} />)}
    </Screen>
  );

  if (facilities.length === 0) {
    return (
      <Screen title={t("facilities.title")}>
        <Text style={styles.empty}>{t("facilities.empty")}</Text>
      </Screen>
    );
  }

  return (
    <Screen title={t("facilities.title")} scroll={false}>
      <Text style={styles.callFirst}>{hindi ? "डेमो केंद्र और अभ्यास की रिपोर्ट — जानकारी फ़ोन पर जाँचें।" : "Demo facility records and simulated reports. Confirm details by phone."}</Text>
      <Text style={styles.callFirst}>{t("freshness.callFirst")}</Text>
      {outcome?.fallbackApplied && (
        <Text style={styles.fallback}>{t("facilities.fallbackApplied")}</Text>
      )}
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
              {item.reasons.map((reason) => (
                <Text key={reason} style={styles.reason}>{reason}</Text>
              ))}
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
  callFirst: { ...(type.body as object), color: ink.strong, fontWeight: "700", marginBottom: space.sm },
  fallback: { ...(type.body as object), color: ink.body, marginBottom: space.sm },
  name: { ...(type.section as object), color: ink.strong, marginBottom: space.xs },
  distance: { ...(type.meta as object), color: ink.muted, marginBottom: space.sm },
  reason: { ...(type.meta as object), color: ink.body, marginTop: space.xs },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
