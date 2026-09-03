import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../src/ui/Screen.tsx";
import { t } from "../src/i18n/strings.ts";
import { ink, type, space } from "../src/theme/tokens.ts";

// Phase 10 — full honesty screen content goes here.
// For now, minimal implementation so imports succeed.
export default function About(): React.ReactNode {
  return (
    <Screen title="About">
      <Text style={styles.heading}>What this app does</Text>
      <Text style={styles.body}>It tells you how soon to get help, and where the nearest suitable health facility is. It works without internet.</Text>
      <Text style={styles.heading}>What it does not do</Text>
      <Text style={styles.body}>It does not diagnose. It does not prescribe. It cannot tell you whether a facility is open right now.</Text>
      <Text style={styles.heading}>Status</Text>
      <Text style={[styles.body, { fontWeight: "600" }]}>THIS PROTOTYPE HAS NOT BEEN CLINICALLY VALIDATED.</Text>
      <Text style={styles.body}>The rules come from published guidance but have not been reviewed or approved by a clinical authority for use in care. Do not use it as the only basis for a decision about a sick person.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...(type.section as object), color: ink.strong, marginTop: space.md, marginBottom: space.xs },
  body: { ...(type.body as object), color: ink.body, marginBottom: space.sm },
});
