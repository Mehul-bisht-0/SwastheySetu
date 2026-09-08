import React, { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { registerPatient } from "../../src/state/patientSession.ts";

export default function PatientRegister(): React.ReactNode {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [districtCode, setDistrictCode] = useState("227");
  const [homeAddress, setHomeAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(): Promise<void> {
    setBusy(true); setError("");
    const result = await registerPatient({ fullName, phone, password, districtCode, homeAddress });
    setBusy(false);
    if (result.ok) router.replace("/(patient)/home"); else setError(result.error ?? "Registration failed.");
  }
  const disabled = !fullName || !phone || password.length < 8 || !districtCode || homeAddress.length < 5;
  return <Screen title="Create patient account / मरीज खाता" onBack={() => router.replace("/")} footer={<Button label="Create account / खाता बनाएँ" onPress={() => void submit()} busy={busy} disabled={disabled} />}>
    <Text>Your symptom checker remains usable without an account. This account is only for verified emergency dispatch.</Text>
    <Field label="Full name / पूरा नाम" value={fullName} onChange={setFullName} />
    <Field label="Phone (+91…)" value={phone} onChange={setPhone} keyboardType="phone-pad" />
    <Field label="Password (minimum 8 characters)" value={password} onChange={setPassword} secure />
    <Field label="District code / जिला कोड" value={districtCode} onChange={setDistrictCode} />
    <Field label="Home address / घर का पता" value={homeAddress} onChange={setHomeAddress} multiline />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </Screen>;
}
