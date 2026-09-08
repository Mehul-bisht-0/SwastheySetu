import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Choice, Field } from "../../src/ui/Field.tsx";
import { completeMockAbhaLink, startAbhaLink, type AbhaLinkSession } from "../../src/api/patients.ts";
import { ink, paper, radius, space, type } from "../../src/theme/tokens.ts";
import { safeBack } from "../../src/navigation/safeBack.ts";

type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";
const groups: BloodGroup[] = ["A+","A-","B+","B-","AB+","AB-","O+","O-","UNKNOWN"];
function list(value: string): string[] { return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20); }

export default function AbhaLink(): React.ReactNode {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [session, setSession] = useState<AbhaLinkSession | null>(null);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | null>("UNKNOWN");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [conditions, setConditions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin(): Promise<void> {
    setBusy(true); setError("");
    const result = await startAbhaLink(identifier);
    setBusy(false);
    if (result.ok && result.data) setSession(result.data);
    else setError(result.error?.message ?? "Could not start ABHA linking.");
  }

  async function complete(): Promise<void> {
    if (!session) return;
    setBusy(true); setError("");
    const result = await completeMockAbhaLink({
      abhaLinkSessionId: session.abhaLinkSessionId,
      summary: { bloodGroup, allergies: list(allergies), medications: list(medications), conditions: list(conditions) },
    });
    setBusy(false);
    if (result.ok) router.replace("/(patient)/home");
    else setError(result.error?.message ?? "ABHA linking did not complete.");
  }

  return <Screen title="Link ABHA / ABHA लिंक करें" onBack={() => safeBack(router, "/(patient)/home")}>
    <View style={styles.notice}>
      <Text style={styles.heading}>ABHA card is not the medical record</Text>
      <Text style={styles.body}>ABHA identifies and links records. An ABDM Health Information User must request your granular, time-bound consent before retrieving selected records.</Text>
      <Text style={styles.body}>SwasthyaSetu stores only a masked/hash identifier, consent reference and minimal emergency summary—never a card image or raw FHIR bundle.</Text>
    </View>
    {!session ? <>
      <Field label="ABHA number or address" help="Example: 12-3456-7890-1234 or name@abdm" value={identifier} onChange={setIdentifier} />
      <Button label="I consent — link through ABDM" onPress={() => void begin()} busy={busy} disabled={identifier.length < 5} />
    </> : null}
    {session?.linkMode === "DEVELOPMENT_MOCK" ? <View style={styles.demo}>
      <Text style={styles.heading}>Development simulation only</Text>
      <Text style={styles.body}>No ABDM record is fetched. Do not enter real medical information here. These fields simulate a minimal provider response for testing.</Text>
      <Choice label="Blood group" value={bloodGroup} onChange={setBloodGroup} options={groups.map((value) => ({ value, label: value }))} />
      <Field label="Allergies (comma separated)" value={allergies} onChange={setAllergies} />
      <Field label="Current medicines (comma separated)" value={medications} onChange={setMedications} />
      <Field label="Known conditions (comma separated)" value={conditions} onChange={setConditions} />
      <Button label="Complete demo ABHA consent" onPress={() => void complete()} busy={busy} />
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
