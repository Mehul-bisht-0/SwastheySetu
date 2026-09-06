import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/Screen.tsx";
import { Button } from "../src/ui/Button.tsx";
import { Field } from "../src/ui/Field.tsx";
import { getSession, signIn } from "../src/state/session.ts";
import { t } from "../src/i18n/strings.ts";
import { ink, type, space } from "../src/theme/tokens.ts";

export default function HomeEntry(): React.ReactNode {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getSession()) router.replace("/(asha)/home");
  }, [router]);

  async function onSubmit(): Promise<void> {
    setBusy(true);
    setError("");
    const result = await signIn(phone, password);
    setBusy(false);
    if (result.ok) router.replace("/(asha)/home");
    else setError(result.error ?? t("asha.login.failed"));
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.name}>{t("app.name")}</Text>
        <Text style={styles.tagline}>{t("app.tagline")}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("asha.login.title")}</Text>
        <Field label={t("asha.login.phone")} value={phone} onChange={setPhone} keyboardType="phone-pad" />
        <Field label={t("asha.login.password")} value={password} onChange={setPassword} secure />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button label={t("asha.login.submit")} onPress={() => void onSubmit()} busy={busy} disabled={!phone || !password} />
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("role.citizen")}</Text>
        <Button label={t("asha.home.newTriage")} variant="secondary" onPress={() => router.push("/(citizen)/patient")} />
        <Button label={t("ivr.entry")} variant="secondary" onPress={() => router.push("/(citizen)/ivr")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.xs, marginBottom: space.lg },
  name: { ...(type.title as object), color: ink.strong },
  tagline: { ...(type.body as object), color: ink.muted, textAlign: "center" },
  section: { gap: space.sm, marginBottom: space.lg },
  heading: { ...(type.section as object), color: ink.strong },
  error: { ...(type.body as object), color: "#8F1D14" },
});
