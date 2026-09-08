import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { paper, ink, type, space, touch, radius, accent } from "../theme/tokens.ts";

export function Field(props: {
  label?: string; value: string; onChange: (v: string) => void;
  help?: string; error?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  secure?: boolean;
  multiline?: boolean;
}): React.ReactNode {
  const [focused, setFocused] = useState(false);
  const borderColor = props.error ? "#8F1D14" : focused ? accent : paper.rule;
  const borderWidth = focused || props.error ? 2 : 1;
  return (
    <View style={styles.wrap}>
      {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
      {props.help ? <Text style={styles.help}>{props.help}</Text> : null}
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { borderColor, borderWidth }]}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secure ?? false}
        multiline={props.multiline ?? false}
        accessibilityLabel={props.label}
        allowFontScaling
      />
      {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
    </View>
  );
}

export function Choice<T extends string>(props: {
  label?: string;
  options: Array<{ value: T; label: string; help?: string }>;
  value: T | null;
  onChange: (v: T) => void;
  stacked?: boolean;
}): React.ReactNode {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={props.label}>
      {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
      <View style={props.stacked ? styles.column : styles.row}>
        {props.options.map((opt) => {
          const selected = props.value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => props.onChange(opt.value)}
              style={[styles.segment, props.stacked && styles.segmentStacked, selected && styles.segmentSelected]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={opt.label}
            >
              <Text style={[styles.segLabel, selected && styles.segLabelSelected]}>{opt.label}</Text>
              {opt.help && selected ? <Text style={styles.segHelp}>{opt.help}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { ...(type.body as object), color: ink.body, marginBottom: space.xs },
  help: { ...(type.meta as object), color: ink.muted, marginBottom: space.xs },
  input: { minHeight: touch.min, backgroundColor: paper.raised, borderRadius: radius.chip, paddingHorizontal: space.md, ...(type.body as object), color: ink.strong },
  error: { ...(type.meta as object), color: "#8F1D14", marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  column: { gap: space.sm },
  segment: { flex: 1, minHeight: touch.min, borderWidth: 1, borderColor: paper.rule, borderRadius: radius.chip, backgroundColor: paper.raised, alignItems: "center", justifyContent: "center", padding: space.sm },
  segmentStacked: { flex: 0, width: "100%" },
  segmentSelected: { borderWidth: 2, borderColor: ink.strong, backgroundColor: paper.sunken },
  segLabel: { ...(type.body as object), color: ink.body, textAlign: "center" },
  segLabelSelected: { ...(type.body as object), fontWeight: "600", color: ink.strong },
  segHelp: { ...(type.meta as object), color: ink.muted, textAlign: "center", marginTop: 2 },
});
