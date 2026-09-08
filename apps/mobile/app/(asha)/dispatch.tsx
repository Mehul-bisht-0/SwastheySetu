import React, { useCallback, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { getDispatchQueue, updateDispatchStatus, type DispatchEmergency, type DispatchStatus } from "../../src/api/emergencyDispatch.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";

function actions(status: DispatchStatus): Array<{ label: string; status: DispatchStatus }> {
  if (status === "DISPATCH_PENDING") return [{ label: "Confirm facility notified", status: "FACILITY_NOTIFIED" }];
  if (status === "FACILITY_NOTIFIED") return [{ label: "Accept emergency", status: "ACCEPTED" }, { label: "Decline", status: "DECLINED" }];
  if (status === "ACCEPTED") return [{ label: "Confirm ambulance dispatched", status: "AMBULANCE_DISPATCHED" }];
  if (status === "AMBULANCE_DISPATCHED") return [{ label: "Mark ambulance arrived", status: "ARRIVED" }];
  if (status === "ARRIVED") return [{ label: "Mark completed", status: "COMPLETED" }];
  return [];
}

export default function DispatchQueue(): React.ReactNode {
  const router = useRouter();
  const [items, setItems] = useState<DispatchEmergency[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    const result = await getDispatchQueue();
    if (result.ok && result.data) { setItems(result.data.items); setError(""); }
    else setError(result.error?.message ?? "Could not load dispatch queue.");
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]));
  async function change(item: DispatchEmergency, status: DispatchStatus): Promise<void> {
    setBusyId(item.emergencyId); setError("");
    const result = await updateDispatchStatus(item.emergencyId, status);
    setBusyId("");
    if (result.ok) await load(); else setError(result.error?.message ?? "Status update failed.");
  }
  return <Screen title="Facility emergency alerts (demo)" onBack={() => safeBack(router, "/(asha)/home")}>
    <Text style={styles.warning}>Development simulator: alerts are read from the database outbox and refresh every 3 seconds. No real hospital webhook, SMS, or ambulance service is connected.</Text>
    <Text style={styles.meta}>Only record a notification, acceptance, or ambulance dispatch after it has actually happened.</Text>
    {items.length === 0 ? <Text style={styles.body}>No active emergency alerts.</Text> : null}
    {items.map((item) => <View key={item.emergencyId} style={styles.card}>
      <Text style={styles.alertLabel}>URGENT PATIENT ALERT</Text>
      <Text style={styles.heading}>{item.status.replaceAll("_", " ")} · {item.emergencyType}</Text>
      <Text style={styles.meta}>Requested {new Date(item.requestedAt).toLocaleString()} · ID {item.emergencyId.slice(0, 8)}</Text>
      <Text style={styles.body}>{item.patient.fullName} · {item.patient.phone}</Text>
      <Text style={styles.body}>{item.location.address}</Text>
      <Text style={styles.meta}>GPS: {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}</Text>
      <Text style={styles.body}>Alert target: {item.facility.name} · {(item.facility.distanceMeters / 1000).toFixed(1)} km straight-line</Text>
      {item.notification ? <View style={styles.notification}>
        <Text style={styles.heading}>Notification outbox</Text>
        <Text style={styles.body}>{item.notification.channel.replaceAll("_", " ")} · {item.notification.deliveryStatus}</Text>
        <Text style={styles.meta}>Created {new Date(item.notification.createdAt).toLocaleString()} · ID {item.notification.notificationId.slice(0, 8)}</Text>
      </View> : <Text style={styles.caution}>No notification outbox record was found.</Text>}
      {item.notes ? <Text style={styles.body}>Note: {item.notes}</Text> : null}
      {item.triageContext ? <View style={styles.triage}>
        <Text style={styles.heading}>Patient-consented triage metadata</Text>
        <Text style={styles.body}>Urgency: {item.triageContext.tier.replaceAll("_", " ")} · decided by {item.triageContext.decisionSource.replaceAll("_", " ").toLowerCase()}</Text>
        <Text style={styles.body}>Patient context: {Math.floor(item.triageContext.patient.ageMonths / 12)} years · {item.triageContext.patient.sex} · pregnancy {item.triageContext.patient.pregnancy}</Text>
        <Text style={styles.body}>Symptoms: {item.triageContext.symptoms.map((symptom) => symptom.replaceAll("_", " ").toLowerCase()).join(", ") || "none recorded"}</Text>
        <Text style={styles.body}>Red flags: {item.triageContext.redFlagLabels.join("; ") || "none recorded"}</Text>
        <Text style={styles.meta}>Assessed {new Date(item.triageContext.evaluatedAt).toLocaleString()} · rules {item.triageContext.rulesetVersion} · report {item.triageContext.reportId.slice(0, 8)}</Text>
        <Text style={styles.caution}>{item.triageContext.disclaimer}</Text>
      </View> : <Text style={styles.meta}>No symptom-check metadata was shared for this request.</Text>}
      {item.clinicalSummary ? <View style={styles.clinical}>
        <Text style={styles.heading}>Consented ABHA emergency summary</Text>
        <Text style={styles.caution}>{item.clinicalSummary.caution}</Text>
        <Text style={styles.body}>Blood group: {item.clinicalSummary.bloodGroup ?? "not present"}</Text>
        <Text style={styles.body}>Allergies: {item.clinicalSummary.allergies.join(", ") || "none listed"}</Text>
        <Text style={styles.body}>Current medicines: {item.clinicalSummary.medications.join(", ") || "none listed"}</Text>
        <Text style={styles.body}>Known conditions: {item.clinicalSummary.conditions.join(", ") || "none listed"}</Text>
        <Text style={styles.meta}>Source: {item.clinicalSummary.source} · fetched {new Date(item.clinicalSummary.fetchedAt).toLocaleString()}</Text>
      </View> : <Text style={styles.meta}>No ABHA emergency summary was shared for this request.</Text>}
      <Button label="Call patient" variant="secondary" onPress={() => void Linking.openURL(`tel:${item.patient.phone}`)} />
      {item.facility.phone ? <Button label="Call alert-target facility" variant="secondary" onPress={() => void Linking.openURL(`tel:${item.facility.phone}`)} /> : null}
      {actions(item.status).map((action) => <Button key={action.status} label={action.label} onPress={() => void change(item, action.status)} busy={busyId === item.emergencyId} />)}
    </View>)}
    <Button label="Refresh alerts" variant="secondary" onPress={() => void load()} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  warning: { ...(type.body as object), color: "#8F1D14", marginBottom: space.sm },
  card: { backgroundColor: paper.raised, borderWidth: 1, borderColor: paper.rule, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.md },
  heading: { ...(type.section as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  meta: { ...(type.meta as object), color: ink.muted },
  caution: { ...(type.meta as object), color: "#8F1D14", fontWeight: "700" },
  alertLabel: { ...(type.meta as object), color: "#8F1D14", fontWeight: "700", letterSpacing: 0.6 },
  notification: { backgroundColor: paper.sunken, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  triage: { backgroundColor: "#F7DCD9", borderColor: "#8F1D14", borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  clinical: { backgroundColor: paper.sunken, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  error: { ...(type.body as object), color: "#8F1D14", marginTop: space.md },
});
