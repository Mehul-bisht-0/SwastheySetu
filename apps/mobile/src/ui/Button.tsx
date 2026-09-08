import React from "react";
import { Pressable, Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { paper, ink, tier, type, touch, radius } from "../theme/tokens.ts";

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "emergency";
  disabled?: boolean;
  busy?: boolean;
}): React.ReactNode {
  const v = props.variant ?? "primary";
  const disabled = (props.disabled ?? false) || (props.busy ?? false);
  const minH = v === "emergency" ? touch.emergency : touch.min;
  const bg = v === "primary" ? ink.strong : v === "emergency" ? tier.EMERGENCY.fill : paper.raised;
  const textColor = v === "secondary" ? ink.strong : "#FFFFFF";
  const borderWidth = v === "secondary" ? 1 : 0;
  const borderColor = v === "secondary" ? paper.rule : "transparent";
  return (
    <Pressable
      onPress={disabled ? undefined : props.onPress}
      style={({ pressed }) => [styles.base, { minHeight: minH, backgroundColor: disabled ? paper.sunken : bg, borderWidth, borderColor, opacity: pressed ? 0.85 : 1, borderRadius: radius.chip }]}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: props.busy }}
      accessibilityLabel={props.label}
    >
      {props.busy
        ? <ActivityIndicator color={textColor} />
        : <Text style={[styles.label, { color: disabled ? ink.muted : textColor }]}>{props.label}</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  label: { ...(type.action as object) },
});
