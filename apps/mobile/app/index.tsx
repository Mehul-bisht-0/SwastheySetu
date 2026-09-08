import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, BackHandler } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/Screen.tsx";
import { Button } from "../src/ui/Button.tsx";
import { getSession } from "../src/state/session.ts";
import { getPatientSession } from "../src/state/patientSession.ts";
import { getLocale, setLocale, t } from "../src/i18n/strings.ts";
import type { Locale } from "../src/i18n/strings.ts";
import { ink, paper, radius, type, space, touch } from "../src/theme/tokens.ts";

function LanguageChoice(props: {
  value: Locale;
  selected: boolean;
  label: string;
  onSelect: (locale: Locale) => void;
}): React.ReactNode {
  return (
    <Pressable
      onPress={() => props.onSelect(props.value)}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      style={({ pressed }) => [
        styles.languageChoice,
        props.selected && styles.languageChoiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.languageLabel, props.selected && styles.languageLabelSelected]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export default function HomeEntry(): React.ReactNode {
  const router = useRouter();
  const [locale, setScreenLocale] = useState<Locale>(() => getLocale());

  useEffect(() => {
    if (getSession()) router.replace("/(asha)/home");
    else if (getPatientSession()) router.replace("/(patient)/home");
  }, [router]);

  function chooseLocale(nextLocale: Locale): void {
    setLocale(nextLocale);
    setScreenLocale(nextLocale);
  }

  return (
    <Screen>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.name}>{t("app.name")}</Text>
          <Text style={styles.tagline}>{t("app.tagline")}</Text>
        </View>
        <View
          style={styles.languageGroup}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("ivr.language.title")}
        >
          <LanguageChoice value="hi" selected={locale === "hi"} label={t("ivr.language.hindi")} onSelect={chooseLocale} />
          <LanguageChoice value="en" selected={locale === "en"} label={t("ivr.language.english")} onSelect={chooseLocale} />
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.bridgeMark} accessibilityElementsHidden>
          <View style={styles.bridgePillar} />
          <View style={styles.bridgeSpan} />
          <View style={styles.bridgePillar} />
        </View>
        <Text style={styles.question}>{t("role.title")}</Text>
      </View>

      <View style={styles.primarySection}>
        <View style={styles.roleHeading}>
          <Text style={styles.roleLabel}>{t("role.citizen")}</Text>
        </View>
        <Button label="Patient sign in / मरीज साइन इन" onPress={() => router.push("/(patient)/login")} />
        <Button label="Create patient account / मरीज खाता" variant="secondary" onPress={() => router.push("/(patient)/register")} />
      </View>

      <View style={styles.divider} />

      <View style={styles.workerSection}>
        <View style={styles.roleHeading}>
          <Text style={styles.roleLabel}>{t("role.asha")}</Text>
        </View>
        <Button label={t("asha.login.submit")} variant="secondary" onPress={() => router.push("/(asha)/login")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.xxl,
  },
  name: { ...(type.section as object), color: ink.strong },
  tagline: { ...(type.meta as object), color: ink.muted, marginTop: 2 },
  languageGroup: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.chip,
    overflow: "hidden",
  },
  languageChoice: {
    minHeight: touch.min,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: paper.raised,
    paddingHorizontal: space.sm,
  },
  languageChoiceSelected: { backgroundColor: ink.strong },
  languageLabel: { ...(type.meta as object), color: ink.body, fontWeight: "600" },
  languageLabelSelected: { color: ink.inverse },
  pressed: { opacity: 0.72 },
  hero: { alignItems: "center", marginBottom: space.xl },
  bridgeMark: {
    width: 64,
    height: 40,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  bridgePillar: { width: 8, height: 40, backgroundColor: ink.strong, borderRadius: radius.chip },
  bridgeSpan: { flex: 1, height: 8, backgroundColor: ink.strong, marginBottom: 13 },
  question: { ...(type.title as object), color: ink.strong, textAlign: "center" },
  primarySection: {
    backgroundColor: paper.raised,
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.sm,
  },
  workerSection: { gap: space.sm },
  roleHeading: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  roleLabel: { ...(type.section as object), color: ink.strong, flex: 1 },
  divider: { height: 1, backgroundColor: paper.rule, marginVertical: space.lg },
});
