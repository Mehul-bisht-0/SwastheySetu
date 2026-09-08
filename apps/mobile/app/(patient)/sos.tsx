import React, { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, Text, View } from "react-native";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { createEmergency, getAbhaStatus, type AbhaStatus, type SharedTriageContext } from "../../src/api/patients.ts";
import { getPatientSession } from "../../src/state/patientSession.ts";
import { getReport } from "../../src/db/dao/reports.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";

export default function PatientSos(): React.ReactNode {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId?: string }>();
  const triageReport = reportId ? getReport(reportId) : null;
  const canShareTriage = triageReport?.result.tier === "EMERGENCY" || triageReport?.result.tier === "GO_NOW";
  const [address, setAddress] = useState(getPatientSession()?.homeAddress ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [abha, setAbha] = useState<AbhaStatus | null>(null);
  const [shareSummary, setShareSummary] = useState(false);
  const [shareTriage, setShareTriage] = useState(false);
  useEffect(() => {
    void getAbhaStatus().then((result) => { if (result.ok && result.data) setAbha(result.data); });
  }, []);

  async function send(): Promise<void> {
    setBusy(true); setError("");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setBusy(false); setError("Location permission is required to select the nearest facility."); return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      let triageContext: SharedTriageContext | undefined;
      if (shareTriage && triageReport && (triageReport.result.tier === "EMERGENCY" || triageReport.result.tier === "GO_NOW")) {
        triageContext = {
          reportId: triageReport.reportId,
          tier: triageReport.result.tier,
          decisionSource: triageReport.result.decisionSource,
          patient: triageReport.encounter.patient,
          symptoms: triageReport.encounter.symptoms,
          redFlagLabels: triageReport.result.redFlagHits.map((hit) => hit.label),
          rulesetVersion: triageReport.result.rulesetVersion,
          evaluatedAt: triageReport.result.evaluatedAt,
          disclaimer: triageReport.result.disclaimer,
        };
      }
      const result = await createEmergency({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        address,
        consentToShareHealthSummary: shareSummary,
        consentToShareTriageContext: triageContext !== undefined,
        ...(triageContext ? { triageContext } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setBusy(false);
      if (result.ok) router.replace("/(patient)/emergency");
      else setError(result.error?.message ?? "Emergency request failed.");
    } catch (cause) {
      setBusy(false); setError(String(cause));
    }
  }

  function confirm(): void {
    Alert.alert(
      "Send emergency request?",
      `Your identity, phone, address, and precise location will be shared with the selected facility.${shareTriage && canShareTriage ? " Your urgent triage summary will also be shared." : ""}${shareSummary ? " Your consented ABHA emergency summary will also be shared." : ""} This does not guarantee an ambulance until the facility confirms dispatch.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Send SOS", style: "destructive", onPress: () => void send() }],
    );
  }

  return <Screen title="Emergency SOS / आपातकाल" onBack={() => safeBack(router, "/(patient)/home")} footer={<Button label="Send SOS request" variant="emergency" onPress={confirm} busy={busy} disabled={address.length < 5} />}>
    <View style={styles.warning}>
      <Text style={styles.heading}>If anyone is in immediate danger, call 112 now.</Text>
      <Button label="Call 112 / 112 कॉल करें" variant="emergency" onPress={() => void Linking.openURL("tel:112")} />
    </View>
    <Field label="Pickup address / पिकअप पता" value={address} onChange={setAddress} multiline />
    <Field label="Short note for dispatcher (optional)" value={notes} onChange={setNotes} multiline />
    {canShareTriage && triageReport ? <View style={styles.summaryChoice}>
      <View style={styles.summaryText}>
        <Text style={styles.heading}>Share urgent symptom-check summary</Text>
        <Text style={styles.body}>Share urgency tier, age/sex/pregnancy context, selected symptom codes, red-flag labels, assessment time and ruleset version. Questionnaire answers are not shared.</Text>
      </View>
      <Switch value={shareTriage} onValueChange={setShareTriage} accessibilityLabel="Share urgent symptom-check summary" />
    </View> : null}
    {abha?.summaryAvailable ? <View style={styles.summaryChoice}>
      <View style={styles.summaryText}>
        <Text style={styles.heading}>Share ABHA emergency summary</Text>
        <Text style={styles.body}>Share allergies, medicines, conditions and blood group for this SOS. Consent valid until {abha.summaryValidUntil ? new Date(abha.summaryValidUntil).toLocaleString() : "unknown"}.</Text>
      </View>
      <Switch value={shareSummary} onValueChange={setShareSummary} accessibilityLabel="Share ABHA emergency summary" />
    </View> : <Text style={styles.body}>No current consented ABHA emergency summary is available. You can still send the SOS.</Text>}
    <Text style={styles.body}>Sending shares your verified identity, phone number, address, and current GPS location for this emergency.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  warning: { backgroundColor: paper.raised, borderColor: "#8F1D14", borderWidth: 2, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.lg },
  heading: { ...(type.section as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  summaryChoice: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: paper.sunken, padding: space.md, borderRadius: radius.card, marginBottom: space.md },
  summaryText: { flex: 1, gap: space.xs },
  error: { ...(type.body as object), color: "#8F1D14", marginTop: space.md },
});
