import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { paper, ink, radius, space, touch, type } from "../theme/tokens.ts";

export function SymptomTile(props: {
  code: string;
  label: string;
  selected: boolean;
  onToggle: () => void;
}): React.ReactNode {
  return (
    <Pressable
      onPress={props.onToggle}
      style={({ pressed }) => [
        styles.tile,
        props.selected && styles.selected,
        pressed && styles.pressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected }}
      accessibilityLabel={props.label}
    >
      <View style={[styles.indicator, props.selected && styles.indicatorSelected]}>
        {props.selected && <Text style={styles.tick}>{'\u2713'}</Text>}
      </View>
      <Text style={[styles.label, props.selected && styles.labelSel]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: touch.tile,
    borderWidth: 1.5,
    borderColor: paper.rule,
    borderRadius: radius.card,
    backgroundColor: paper.raised,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  selected: {
    borderWidth: 2,
    borderColor: ink.strong,
    backgroundColor: paper.sunken,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    ...(type.body as object),
    flex: 1,
    color: ink.body,
    fontWeight: "500",
  },
  labelSel: {
    color: ink.strong,
    fontWeight: "700",
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: paper.rule,
    backgroundColor: paper.raised,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.md,
  },
  indicatorSelected: {
    borderColor: ink.strong,
    backgroundColor: ink.strong,
  },
  tick: {
    fontSize: 18,
    color: paper.raised,
    fontWeight: "700",
    lineHeight: 22,
  },
});
