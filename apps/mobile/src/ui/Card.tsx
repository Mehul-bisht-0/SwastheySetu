import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { paper, ink, type, space, radius, touch } from "../theme/tokens.ts";

export function Card(props: { children: React.ReactNode; heading?: string; onPress?: () => void }): React.ReactNode {
  const inner = (
    <View style={styles.card}>
      {props.heading ? <Text style={styles.heading}>{props.heading}</Text> : null}
      {props.children}
    </View>
  );
  if (props.onPress) {
    return (
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [{ minHeight: touch.min, opacity: pressed ? 0.9 : 1 }]}
        accessibilityRole="button"
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  card: { backgroundColor: paper.raised, borderWidth: 1, borderColor: paper.rule, borderRadius: radius.card, padding: space.md, marginBottom: space.sm },
  heading: { ...(type.section as object), color: ink.strong, marginBottom: space.sm },
});
