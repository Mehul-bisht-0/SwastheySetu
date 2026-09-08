import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import {
  getPatientSession, signOutPatient, subscribePatient, type PatientSession,
} from "../../src/state/patientSession.ts";
import { getAbhaStatus, getActiveEmergency, type AbhaStatus, type Emergency } from "../../src/api/patients.ts";
import { t } from "../../src/i18n/strings.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";

export default function PatientHome(): React.ReactNode {
  const router = useRouter();
  const [profile, setProfile] = useState<PatientSession | null>(getPatientSession());
  const [abha, setAbha] = useState<AbhaStatus | null>(null);
  const [activeEmergency, setActiveEmergency] = useState<Emergency | null>(null);
  useEffect(() => subscribePatient(setProfile), []);
  useFocusEffect(useCallback(() => {
    let focused = true;
    void getAbhaStatus().then((result) => {
      if (focused && result.ok && result.data) setAbha(result.data);
    });
    void getActiveEmergency().then((result) => {
      if (focused && result.ok) setActiveEmergency(result.data ?? null);
    });
    return () => { focused = false; };
  }, []));
  if (!profile) return null;
  const verified = profile.verificationStatus === "VERIFIED";
  return <Screen title={`Hello, ${profile.fullName}`}>
    <View style={styles.card}>
      <Text style={styles.heading}>Patient health tools / मरीज स्वास्थ्य सेवाएँ</Text>
      <Text style={styles.body}>Use the visual questions or the spoken guide. Both use the same offline, non-diagnostic urgency rules.</Text>
      <Button label={t("asha.home.newTriage")} onPress={() => router.push("/(citizen)/patient")} />
      <Button label={t("ivr.entry")} variant="secondary" onPress={() => router.push("/(citizen)/ivr")} />
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>Identity verification / पहचान सत्यापन</Text>
      <Text style={styles.body}>Status: {profile.verificationStatus}</Text>
      <Text style={styles.meta}>Raw Aadhaar images and face templates are not stored by SwasthyaSetu.</Text>
      {!verified ? <Button label="Verify identity / पहचान सत्यापित करें" variant="secondary" onPress={() => router.push("/(patient)/verify")} /> : null}
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>ABHA health records / ABHA स्वास्थ्य रिकॉर्ड</Text>
      <Text style={styles.body}>{abha?.linked ? `Linked: ${abha.identifierMasked ?? "ABHA"}` : "Not linked"}</Text>
      <Text style={styles.meta}>ABHA linking uses consent-based record access. A card photo is not treated as medical history.</Text>
      <Button label={abha?.linked ? "Refresh ABHA emergency summary" : "Link ABHA"} variant="secondary" onPress={() => router.push("/(patient)/abha")} disabled={!verified} />
    </View>

    <View style={styles.emergencyCard}>
      <Text style={styles.heading}>Medical emergency / चिकित्सा आपातकाल</Text>
      <Text style={styles.body}>Use SOS only for a real emergency. It does not guarantee that a facility has accepted or sent an ambulance.</Text>
      <Button label="Call 112 now / अभी 112 कॉल करें" variant="emergency" onPress={() => void Linking.openURL("tel:112")} />
      {activeEmergency ? <>
        <Text style={styles.active}>An emergency request is currently in progress.</Text>
        <Button label="View active emergency status" onPress={() => router.push("/(patient)/emergency")} />
      </> : <Button label="Request verified-patient dispatch" onPress={() => router.push("/(patient)/sos")} disabled={!verified} />}
      {!verified ? <Text style={styles.meta}>Complete identity verification to enable dispatch requests.</Text> : null}
    </View>

    <Button label="Sign out / साइन आउट" variant="secondary" onPress={() => void signOutPatient().then(() => router.replace("/"))} />
  </Screen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: paper.raised, borderColor: paper.rule, borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.lg },
  emergencyCard: { backgroundColor: paper.raised, borderColor: "#8F1D14", borderWidth: 2, borderRadius: radius.card, padding: space.md, gap: space.sm, marginBottom: space.lg },
  heading: { ...(type.section as object), color: ink.strong },
  body: { ...(type.body as object), color: ink.body },
  active: { ...(type.body as object), color: "#8F1D14", fontWeight: "700" },
  meta: { ...(type.meta as object), color: ink.muted },
});
