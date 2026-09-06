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
  const content = (
    <>
      {props.title ? (
        <View style={styles.header}>
          {props.onBack ? (
            <Pressable
              onPress={props.onBack}
              accessibilityRole="button"
              accessibilityLabel={t("action.back")}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Text style={styles.backArrow}>{"\u2039"}</Text>
              <Text style={styles.backLabel}>{t("action.back")}</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.title, props.onBack && styles.titleWithBack]}>{props.title}</Text>
        </View>
      ) : null}
      {props.children}
    </>
  );
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, props.footer ? styles.scrollWithFooter : styles.scrollNoFooter]}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
      {props.footer ? <View style={[styles.footer, elevation.lifted]}>{props.footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper.base },
  fill: { flex: 1, padding: space.md },
  scroll: { padding: space.md },
  scrollWithFooter: { paddingBottom: 96 },
  scrollNoFooter: { paddingBottom: space.xl },
  header: { marginBottom: space.lg },
  title: { ...(type.title as object), color: ink.strong },
  titleWithBack: { marginTop: space.sm },
  back: {
    alignSelf: "flex-start",
    minHeight: touch.min,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space.md,
  },
  backArrow: { fontSize: 34, lineHeight: 36, color: ink.strong, marginRight: space.xs },
  backLabel: { ...(type.body as object), color: ink.strong, fontWeight: "600" },
  pressed: { opacity: 0.65 },
  footer: { padding: space.md, backgroundColor: paper.raised },
});
