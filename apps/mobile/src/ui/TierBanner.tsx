import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { tier, type, space } from "../theme/tokens.ts";
import type { TierKey } from "../theme/tokens.ts";
import { t } from "../i18n/strings.ts";
import type { StringKey } from "../i18n/strings.ts";

const MARKS: Record<TierKey, string> = { EMERGENCY: "[ ]", GO_NOW: "/\\", PHC_SOON: "(|)", SELF_CARE: "( )" };

export function TierBanner(props: { tier: TierKey }): React.ReactNode {
  const k = props.tier;
  const c = tier[k];
  const headKey = ("triage." + k + ".headline") as StringKey;
  const suppKey = ("triage." + k + ".support") as StringKey;
  return (
    <View style={[styles.banner, { backgroundColor: c.fill }]} accessibilityRole="header">
      <Text style={[styles.mark, { color: c.onFill }]}>{MARKS[k]}</Text>
      <Text style={[styles.headline, { color: c.onFill }]}>{t(headKey)}</Text>
      <Text style={[styles.support, { color: c.onFill }]}>{t(suppKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: space.lg, paddingTop: space.xl },
  mark: { fontSize: 22, marginBottom: space.sm, textAlign: "center", fontWeight: "700" },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: "700", textAlign: "center", marginBottom: space.sm },
  support: { fontSize: 17, lineHeight: 26, textAlign: "center" },
});
