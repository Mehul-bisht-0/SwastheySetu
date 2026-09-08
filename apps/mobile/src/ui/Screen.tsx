import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { paper, ink, type, space, elevation, touch } from "../theme/tokens.ts";
import { t } from "../i18n/strings.ts";

export function Screen(props: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  onBack?: () => void;
}): React.ReactNode {
  const scroll = props.scroll !== false;
  const header = props.title ? (
    <View style={styles.header}>
      {props.onBack ? (
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel={t("action.back")}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backArrow}>{"\u2039"}</Text>
          <Text style={styles.backLabel}>{t("action.back")}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.title, props.onBack && styles.titleWithBack]}>{props.title}</Text>
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.safe}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={[
            styles.scroll,
            props.title && styles.scrollBelowHeader,
            props.footer ? styles.scrollWithFooter : styles.scrollNoFooter,
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          {props.children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{props.children}</View>
      )}
      {props.footer ? <View style={[styles.footer, elevation.lifted]}>{props.footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper.base },
  scroller: { flex: 1 },
  fill: { flex: 1, padding: space.md },
  scroll: { padding: space.md },
  scrollBelowHeader: { paddingTop: 0 },
  scrollWithFooter: { paddingBottom: 96 },
  scrollNoFooter: { paddingBottom: space.xl },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  title: { ...(type.title as object), color: ink.strong, flexShrink: 1 },
  titleWithBack: { flex: 1, paddingTop: 4 },
  back: {
    minHeight: touch.min,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space.sm,
    marginRight: space.sm,
  },
  backArrow: { fontSize: 34, lineHeight: 36, color: ink.strong, marginRight: space.xs },
  backLabel: { ...(type.body as object), color: ink.strong, fontWeight: "600" },
  pressed: { opacity: 0.65 },
  footer: { padding: space.md, backgroundColor: paper.raised },
});
