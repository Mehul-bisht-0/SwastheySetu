import React from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { freshness, paper, radius } from "../theme/tokens.ts";
import type { FreshnessBand } from "@swasthyasetu/core";
import { t } from "../i18n/strings.ts";
import type { StringKey } from "../i18n/strings.ts";

export function humanAge(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 0) return t("time.justNow");
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  const weeks = Math.floor(days / 7);
  if (mins < 90) return t("time.minutes", { n: mins });
  if (hrs < 36) return t("time.hours", { n: hrs });
  if (days < 14) return t("time.days", { n: days });
  return t("time.weeks", { n: weeks });
}

export function FreshnessChip(props: {
  band: FreshnessBand;
  lastConfirmedAt: string | null;
  lastReportedClosedAt: string | null;
}): React.ReactNode {
  const band = props.band;
  const s = freshness[band];
  const source = band === "REPORTED_CLOSED" ? props.lastReportedClosedAt : props.lastConfirmedAt;
  const ago = humanAge(source);
  const strKey = ("freshness." + band) as StringKey;
  const label = ago ? t(strKey, { ago }) : t(strKey);
  return (
    <Pressable onPress={() => Alert.alert("", t("freshness.explain"))} accessibilityLabel={label}>
      <View style={[styles.chip, { backgroundColor: s.fill, borderColor: s.ink, borderStyle: s.border as "solid" | "dashed" | "dotted" }]}>
        <Text style={[styles.text, { color: s.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  text: { fontSize: 15, lineHeight: 21 },
});
