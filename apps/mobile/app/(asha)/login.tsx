import React, { useState } from "react";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Field } from "../../src/ui/Field.tsx";
import { signIn } from "../../src/state/session.ts";
import { t } from "../../src/i18n/strings.ts";
import { View, Text, StyleSheet } from "react-native";
import { ink, type, space } from "../../src/theme/tokens.ts";

export default function LoginScreen(): React.ReactNode {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function onSubmit() {
    setBusy(true);
    setError("");
    const res = await signIn(phone, password);
    setBusy(false);
    if (res.ok) router.replace("/(asha)/home"); else setError(res.error ?? t("asha.login.failed"));
  }
  return (
    <Screen title={t("asha.login.title")} footer={<Button label={t("asha.login.submit")} onPress={onSubmit} busy={busy} disabled={!phone || !password} />}>
      <Field label={t("asha.login.phone")} value={phone} onChange={setPhone} keyboardType="phone-pad" />
      <Field label={t("asha.login.password")} value={password} onChange={setPassword} secure />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ error: { ...(type.body as object), color: "#8F1D14", marginTop: space.sm } });
