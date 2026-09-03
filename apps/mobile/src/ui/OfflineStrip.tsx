import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { isOnline, onConnectivityChange } from "../sync/netStatus.ts";
import { paper, ink, type, space } from "../theme/tokens.ts";
import { t } from "../i18n/strings.ts";

export function OfflineStrip(): React.ReactNode {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    isOnline().then(setOnline);
    return onConnectivityChange(setOnline);
  }, []);
  if (online) return null;
  return (
    <View style={styles.strip}>
      <Text style={styles.text}>{t("net.offlineDetail")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: 32, backgroundColor: paper.sunken, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 15, color: ink.muted },
});