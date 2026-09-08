import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { completeMockVerification, startVerification, type VerificationSession } from "../../src/api/patients.ts";
import { updatePatientProfile } from "../../src/state/patientSession.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";

export default function VerifyPatient(): React.ReactNode {
  const router = useRouter();
  const [verification, setVerification] = useState<VerificationSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin(): Promise<void> {
    setBusy(true); setError("");
    const result = await startVerification();
    setBusy(false);
    if (result.ok && result.data) setVerification(result.data);
    else setError(result.error?.message ?? "Could not start verification.");
  }

  async function completeDemo(): Promise<void> {
    if (!verification) return;
    setBusy(true); setError("");
    const result = await completeMockVerification(verification.verificationSessionId);
    setBusy(false);
    if (result.ok && result.data) {
      await updatePatientProfile(result.data);
      router.replace("/(patient)/home");
    } else setError(result.error?.message ?? "Verification did not complete.");
  }

  return <Screen title="Verify identity / पहचान सत्यापित करें" onBack={() => safeBack(router, "/(patient)/home")}>
    <View style={styles.notice}>
      <Text style={styles.heading}>Consent and privacy</Text>
      <Text style={styles.body}>A production verification provider will collect a live selfie and Aadhaar Offline e-KYC directly. SwasthyaSetu stores only the provider reference and result.</Text>
      <Text style={styles.body}>Verification is voluntary. The symptom checker and calling 112 remain usable without it.</Text>
    </View>
    {!verification ? <Button label="I consent — start verification" onPress={() => void begin()} busy={busy} /> : null}
    {verification?.uploadMode === "DEVELOPMENT_MOCK" ? <View style={styles.demo}>
      <Text style={styles.heading}>Development simulation</Text>
      <Text style={styles.body}>No Aadhaar or selfie is collected in this prototype. This button simulates a successful response from an authorised provider.</Text>
      <Button label="Complete demo verification" onPress={() => void completeDemo()} busy={busy} />
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: paper.raised, borderColor: paper.rule, borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.lg },
  demo: { backgroundColor: paper.sunken, borderRadius: radius.card, padding: space.md, gap: space.sm, marginTop: space.lg },
  heading: { ...(type.section as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  error: { ...(type.body as object), color: "#8F1D14", marginTop: space.md },
});
