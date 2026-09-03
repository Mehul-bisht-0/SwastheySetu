import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { paper, type, space, elevation } from "../theme/tokens.ts";

export function Screen(props: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}): React.ReactNode {
  const scroll = props.scroll !== false;
  const content = (
    <>
      {props.title ? <Text style={styles.title}>{props.title}</Text> : null}
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
  title: { ...(type.title as object), color: "#171512", marginBottom: space.md },
  footer: { padding: space.md, backgroundColor: paper.raised },
});
