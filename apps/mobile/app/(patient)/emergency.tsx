import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { cancelEmergency, getActiveEmergency, type Emergency } from "../../src/api/patients.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";

const statusCopy: Record<Emergency["status"], string> = {
  DISPATCH_PENDING: "Request recorded. The facility has not yet confirmed receipt.",
  FACILITY_NOTIFIED: "The selected facility has received the request. An ambulance is not yet confirmed.",
  ACCEPTED: "The facility accepted the request. Ambulance dispatch is not yet confirmed.",
  AMBULANCE_DISPATCHED: "The facility reports that an ambulance has been dispatched.",
  ARRIVED: "The facility reports that the ambulance has arrived.",
  COMPLETED: "Emergency response marked complete.",
  DECLINED: "The selected facility declined the request. Call 112 immediately.",
  CANCELLED: "Emergency request cancelled.",
  FAILED: "Dispatch failed. Call 112 immediately.",
};

export default function EmergencyStatus(): React.ReactNode {
  const router = useRouter();
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const goHome = useCallback((): void => {
    router.replace("/(patient)/home");
  }, [router]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goHome();
      return true;
    });
    return () => subscription.remove();
  }, [goHome]));

  async function refresh(showProgress = false): Promise<void> {
    if (showProgress) setRefreshing(true);
    setError("");
    try {
      const result = await getActiveEmergency();
      if (result.ok) setEmergency(result.data ?? null);
      else setError(result.error?.message ?? "Could not refresh emergency status.");
    } finally {
      if (showProgress) setRefreshing(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, []);
  async function cancel(): Promise<void> {
    if (!emergency) return;
    const result = await cancelEmergency(emergency.emergencyId);
    if (result.ok) router.replace("/(patient)/home");
    else setError(result.error?.message ?? "Could not cancel this request.");
  }
  return <Screen title="Emergency status / आपातकाल स्थिति" onBack={goHome}>
    <View style={styles.card}>
      <Text style={styles.heading}>{emergency ? statusCopy[emergency.status] : "Checking for an active request…"}</Text>
      {emergency ? <>
        <Text style={styles.body}>Selected facility: {emergency.facility.name}</Text>
        <Text style={styles.body}>Approximate straight-line distance: {Math.round(emergency.facility.distanceMeters / 100) / 10} km</Text>
        <Text style={styles.body}>ABHA emergency summary shared: {emergency.clinicalSummaryShared ? "Yes" : "No"}</Text>
        {emergency.facility.phone ? <Button label="Call selected facility" variant="secondary" onPress={() => void Linking.openURL(`tel:${emergency.facility.phone}`)} /> : null}
      </> : null}
    </View>
    <Button label="Call 112 now" variant="emergency" onPress={() => void Linking.openURL("tel:112")} />
    <Button label="Refresh status" variant="secondary" onPress={() => void refresh(true)} busy={refreshing} />
    {emergency && ["DISPATCH_PENDING", "FACILITY_NOTIFIED", "ACCEPTED", "AMBULANCE_DISPATCHED"].includes(emergency.status)
      ? <Button label="Cancel request" variant="secondary" onPress={() => void cancel()} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: paper.raised, borderColor: paper.rule, borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.lg },
  heading: { ...(type.section as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  error: { ...(type.body as object), color: "#8F1D14", marginTop: space.md },
});
