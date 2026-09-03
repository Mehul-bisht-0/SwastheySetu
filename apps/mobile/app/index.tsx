import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/Screen.tsx";
import { Button } from "../src/ui/Button.tsx";
import { getSession } from "../src/state/session.ts";
import { t } from "../src/i18n/strings.ts";
import { paper, ink, type, space } from "../src/theme/tokens.ts";

export default function RoleChooser(): React.ReactNode {
  const router = useRouter();
  useEffect(() => {
    if (getSession()) router.replace("/(asha)/home");
  }, []);
  return (
    <Screen footer={
      <View style={styles.buttons}>
        <Button label={t("role.citizen")} onPress={() => router.push("/(citizen)/patient")} />
        <Button label={t("role.asha")} variant="secondary" onPress={() => router.push("/(asha)/home")} />
      </View>
    }>
      <View style={styles.hero}>
        <Text style={styles.name}>{t("app.name")}</Text>
        <Text style={styles.tagline}>{t("app.tagline")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  name: { ...(type.title as object), color: ink.strong },
  tagline: { ...(type.body as object), color: ink.muted, textAlign: "center" },
  buttons: { gap: space.sm },
});
