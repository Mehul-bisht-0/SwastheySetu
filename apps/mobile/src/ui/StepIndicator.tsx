import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { accent, ink, paper, radius, space, type } from "../theme/tokens.ts";

export function StepIndicator(props: {
  current: number;
  total: number;
  label: string;
  showLabel?: boolean;
}): React.ReactNode {
  const safeTotal = Math.max(1, props.total);
  const safeCurrent = Math.min(Math.max(1, props.current), safeTotal);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 1, max: safeTotal, now: safeCurrent }}
    >
      {props.showLabel === false ? null : <Text style={styles.label}>{props.label}</Text>}
      <View style={styles.track}>
        {Array.from({ length: safeTotal }, (_, index) => (
          <View
            key={index}
            style={[styles.segment, index + 1 === safeCurrent && styles.active]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { ...(type.meta as object), color: ink.muted, marginBottom: space.sm },
  track: { flexDirection: "row", gap: space.sm },
  segment: { flex: 1, height: 5, backgroundColor: paper.rule, borderRadius: radius.chip },
  active: { backgroundColor: accent },
});
