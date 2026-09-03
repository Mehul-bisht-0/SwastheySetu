import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { paper, ink, type as typ, touch, radius } from "../theme/tokens.ts";

export function SymptomTile(props: { code: string; label: string; selected: boolean; onToggle: () => void }): React.ReactNode {
  return (
    <Pressable onPress={props.onToggle} style={[styles.tile, props.selected && styles.selected]} accessibilityRole="checkbox" accessibilityState={{ checked: props.selected }} accessibilityLabel={props.label}>
      {props.selected && <View style={styles.tickWrap}><Text style={styles.tick}>{'\u2713'}</Text></View>}
      <Text style={[styles.label, props.selected && styles.labelSel]} numberOfLines={2}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: touch.tile, height: touch.tile, borderWidth: 1, borderColor: paper.rule, borderRadius: radius.card, backgroundColor: paper.raised, alignItems: "center", justifyContent: "center", padding: 8, margin: 4 },
  selected: { borderWidth: 2, borderColor: ink.strong, backgroundColor: paper.sunken },
  label: { fontSize: 17, lineHeight: 26, color: ink.body, textAlign: "center" },
  labelSel: { color: ink.strong, fontWeight: "600" },
  tickWrap: { position: "absolute", top: 4, right: 4 },
  tick: { fontSize: 14, color: ink.strong, fontWeight: "700" },
});