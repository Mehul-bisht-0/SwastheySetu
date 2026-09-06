import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { paper, ink, radius } from "../theme/tokens.ts";

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
    flex: 1,
    minHeight: 100,
    borderWidth: 1.5,
    borderColor: paper.rule,
    borderRadius: radius.card,
    backgroundColor: paper.raised,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 12,
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
    fontSize: 16,
    lineHeight: 22,
    color: ink.body,
    textAlign: "center",
    fontWeight: "500",
  },
  labelSel: {
    color: ink.strong,
    fontWeight: "700",
  },
  indicator: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: paper.rule,
    backgroundColor: paper.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorSelected: {
    borderColor: ink.strong,
    backgroundColor: ink.strong,
  },
  tick: {
    fontSize: 12,
    color: paper.raised,
    fontWeight: "700",
    lineHeight: 14,
  },
});