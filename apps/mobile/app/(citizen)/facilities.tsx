import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { FreshnessChip } from "../../src/ui/FreshnessChip.tsx";
import { getReport } from "../../src/db/dao/reports.ts";
import { cachedFacilityCount, rankOffline, replaceFacilityCache } from "../../src/db/dao/facilities.ts";
import { requiredCapability } from "@swasthyasetu/core";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space } from "../../src/theme/tokens.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";
import type { RankingOutcome } from "@swasthyasetu/core";
import * as Location from "expo-location";
import { getLocale } from "../../src/i18n/strings.ts";
import { listVillages, type VillageRow } from "../../src/db/dao/villages.ts";
import { refreshPublicFacilityCache } from "../../src/api/facilityCache.ts";
import { DEMO_FACILITIES, DEMO_FACILITY_CENTRE } from "../../src/data/demoFacilities.ts";

type LocationSource = "DEVICE" | "VILLAGE" | "DEMO_LOCATION_FAILED" | "DEMO_NO_LOCAL_DATA" | "DEMO_SELECTED";

export default function FacilitiesScreen(): React.ReactNode {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [outcome, setOutcome] = useState<RankingOutcome | null>(null);
  const [near, setNear] = useState<{ lat: number; lon: number } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const hindi = getLocale() === "hi";

  async function ensureFacilityData(): Promise<void> {
    if (cachedFacilityCount() > 0) return;
    try {
      const refreshed = await refreshPublicFacilityCache();
      if (refreshed > 0) return;
    } catch {
      // Use the bundled demonstration snapshot below when the API is unreachable.
    }
    replaceFacilityCache(DEMO_FACILITIES);
  }

  function rankAt(
    location: { lat: number; lon: number },
    source: LocationSource,
    selectedVillageId?: string,
  ): void {
    if (!reportId) return;
    const report = getReport(reportId);
    if (!report) return;
    const requirement = requiredCapability(report.encounter, report.result);
    let ranked = rankOffline({
      near: location,
      villageId: selectedVillageId,
      radiusKm: 25,
      requirement,
      tier: report.result.tier,
    });
    let displayedLocation = location;
    let displayedSource = source;

    // This prototype has only the Nalanda demonstration directory. If the
    // device is elsewhere, do not mislabel those facilities as locally nearby.
    if (source === "DEVICE" && ranked.results.length === 0) {
      displayedLocation = DEMO_FACILITY_CENTRE;
      displayedSource = "DEMO_NO_LOCAL_DATA";
      ranked = rankOffline({
        near: DEMO_FACILITY_CENTRE,
        radiusKm: 25,
        requirement,
        tier: report.result.tier,
      });
    }

    setNear(displayedLocation);
    setLocationSource(displayedSource);
    setOutcome(ranked);
  }

  async function locate(): Promise<void> {
    setLocating(true);
    setLocationError(false);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await ensureFacilityData();
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError(true);
        rankAt(DEMO_FACILITY_CENTRE, "DEMO_LOCATION_FAILED");
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Location timeout")), 15000); }),
      ]);
      rankAt({ lat: position.coords.latitude, lon: position.coords.longitude }, "DEVICE");
    } catch {
      setLocationError(true);
      replaceFacilityCache(DEMO_FACILITIES);
      rankAt(DEMO_FACILITY_CENTRE, "DEMO_LOCATION_FAILED");
    } finally {
      if (timeout) clearTimeout(timeout);
      setLocating(false);
    }
  }

  async function showDemo(): Promise<void> {
    setLocating(true);
    setLocationError(false);
    try {
      await ensureFacilityData();
      rankAt(DEMO_FACILITY_CENTRE, "DEMO_SELECTED");
    } finally {
      setLocating(false);
    }
  }

  async function chooseVillage(village: VillageRow): Promise<void> {
    setLocating(true);
    setLocationError(false);
    try {
      await ensureFacilityData();
      rankAt({ lat: village.latitude, lon: village.longitude }, "VILLAGE", village.villageId);
    } finally {
      setLocating(false);
    }
  }

  const facilities = outcome?.results ?? [];
  const villages = listVillages();

  if (!near) return (
    <Screen title={t("facilities.title")} onBack={() => safeBack(router, "/(patient)/home")}>
      <Text style={styles.callFirst}>{hindi ? "नज़दीकी केंद्रों की दूरी के लिए अपनी जगह साझा करें।" : "Share your location to calculate distances to nearby facilities."}</Text>
      <Button label={hindi ? "मेरी जगह का उपयोग करें" : "Use my location"} busy={locating} onPress={() => void locate()} />
      {locationError ? <Text style={styles.empty}>{hindi ? "जगह नहीं मिल सकी। नीचे नालंदा के डेमो केंद्र दिखाए जा सकते हैं।" : "Could not get your location. You can still view the Nalanda demo centres below."}</Text> : null}
      <Button label={hindi ? "नालंदा के डेमो केंद्र दिखाएँ" : "Show Nalanda demo centres"} variant="secondary" disabled={locating} onPress={() => void showDemo()} />
      {villages.length > 0 ? <Text style={styles.callFirst}>{hindi ? "या अपना गाँव चुनें।" : "Or choose your village."}</Text> : null}
      {villages.map((village) => <Button key={village.villageId} label={village.name} variant="secondary" disabled={locating} onPress={() => void chooseVillage(village)} />)}
    </Screen>
  );

  if (facilities.length === 0) {
    return (
      <Screen title={t("facilities.title")} onBack={() => safeBack(router, "/(patient)/home")}>
        <Text style={styles.empty}>{t("facilities.empty")}</Text>
        <Button label={hindi ? "नालंदा के डेमो केंद्र दिखाएँ" : "Show Nalanda demo centres"} variant="secondary" busy={locating} onPress={() => void showDemo()} />
      </Screen>
    );
  }

  return (
    <Screen title={t("facilities.title")} scroll={false} onBack={() => safeBack(router, "/(patient)/home")}>
      {locationSource === "DEVICE" ? <Text style={styles.sourceNotice}>{hindi ? "दूरी आपके फ़ोन की मौजूदा जगह से अनुमानित है।" : "Distances are estimated from this phone's current location."}</Text> : null}
      {locationSource === "DEMO_LOCATION_FAILED" ? <Text style={styles.warning}>{hindi ? "फ़ोन की जगह नहीं मिली। नालंदा के डेमो केंद्र दिखाए गए हैं—ये आपकी मौजूदा जगह के पास होने का दावा नहीं हैं।" : "Device location could not be used. Showing Nalanda demo centres; these are not claimed to be near your current location."}</Text> : null}
      {locationSource === "DEMO_NO_LOCAL_DATA" ? <Text style={styles.warning}>{hindi ? "आपकी जगह के 25 किमी में कोई कैश किया हुआ डेमो रिकॉर्ड नहीं मिला। नालंदा के डेमो केंद्र दिखाए गए हैं।" : "No cached demo record was found within 25 km of your location. Showing the Nalanda demo centres instead."}</Text> : null}
      {locationSource === "DEMO_SELECTED" ? <Text style={styles.warning}>{hindi ? "नालंदा के डेमो केंद्र दिखाए गए हैं। दूरी आपकी मौजूदा जगह से नहीं है।" : "Showing Nalanda demo centres. Distances are not from your current location."}</Text> : null}
      <Text style={styles.callFirst}>{hindi ? "डेमो केंद्र और अभ्यास की रिपोर्ट — जानकारी फ़ोन पर जाँचें।" : "Demo facility records and simulated reports. Confirm details by phone."}</Text>
      <Text style={styles.callFirst}>{t("freshness.callFirst")}</Text>
      {locationSource?.startsWith("DEMO_") ? <Button label={hindi ? "मेरी जगह फिर कोशिश करें" : "Try my location again"} variant="secondary" busy={locating} onPress={() => void locate()} /> : null}
      {outcome?.fallbackApplied ? <Text style={styles.fallback}>{t("facilities.fallbackApplied")}</Text> : null}
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
              {item.reasons.map((reason) => <Text key={reason} style={styles.reason}>{reason}</Text>)}
              <View style={styles.actions}>
                {f.phone ? <Button label={t("facilities.call")} variant="secondary" onPress={() => void Linking.openURL("tel:" + f.phone)} /> : null}
                <Button label={t("facilities.directions")} variant="secondary" onPress={() => void Linking.openURL("https://www.google.com/maps/dir/?api=1&destination=" + f.latitude + "," + f.longitude)} />
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
  sourceNotice: { ...(type.meta as object), color: ink.body, marginBottom: space.sm },
  warning: { ...(type.body as object), color: "#8F1D14", fontWeight: "700", marginBottom: space.sm },
  fallback: { ...(type.body as object), color: ink.body, marginBottom: space.sm },
  name: { ...(type.section as object), color: ink.strong, marginBottom: space.xs },
  distance: { ...(type.meta as object), color: ink.muted, marginBottom: space.sm },
  reason: { ...(type.meta as object), color: ink.body, marginTop: space.xs },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
