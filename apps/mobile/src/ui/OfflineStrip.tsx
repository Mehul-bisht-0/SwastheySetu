import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getConnectivityState, onConnectivityStateChange, type ConnectivityState } from "../sync/netStatus.ts";
import { paper, ink, type, space } from "../theme/tokens.ts";
import { t } from "../i18n/strings.ts";

export function OfflineStrip(): React.ReactNode {
  const [state, setState] = useState<ConnectivityState>("ONLINE");
  useEffect(() => {
    void getConnectivityState().then(setState);
    return onConnectivityStateChange(setState);
  }, []);
  if (state === "ONLINE") return null;
  return (
    <View style={styles.strip}>
      <Text style={styles.text}>{state === "OFFLINE" ? t("net.offlineDetail") : "Limited connection · सीमित कनेक्शन · मर्यादित कनेक्शन"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: 32, backgroundColor: paper.sunken, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 15, color: ink.muted },
});
