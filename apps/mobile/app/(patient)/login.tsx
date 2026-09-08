import React, { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { loginPatient } from "../../src/state/patientSession.ts";

export default function PatientLogin(): React.ReactNode {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(): Promise<void> {
    setBusy(true); setError("");
    const result = await loginPatient(phone, password);
    setBusy(false);
    if (result.ok) router.replace("/(patient)/home"); else setError(result.error ?? "Sign-in failed.");
  }
  return <Screen title="Patient sign in / मरीज साइन इन" onBack={() => router.replace("/")} footer={<Button label="Sign in / साइन इन" onPress={() => void submit()} busy={busy} disabled={!phone || !password} />}>
    <Field label="Phone (+91…)" value={phone} onChange={setPhone} keyboardType="phone-pad" />
    <Field label="Password / पासवर्ड" value={password} onChange={setPassword} secure />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button label="Create patient account / नया खाता" variant="secondary" onPress={() => router.push("/(patient)/register")} />
  </Screen>;
}
