import React, { useState, useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text } from "react-native";
import { initDb } from "../src/db/client.ts";
import { releaseStale } from "../src/db/dao/outbox.ts";
import { setLocale } from "../src/i18n/strings.ts";
import { restoreSession } from "../src/state/session.ts";
import { startSyncDaemon } from "../src/sync/runner.ts";
import { OfflineStrip } from "../src/ui/OfflineStrip.tsx";
import { paper } from "../src/theme/tokens.ts";

function Splash(): React.ReactNode {
  return <View style={{ flex: 1, backgroundColor: paper.base, alignItems: "center", justifyContent: "center" }}><Text>SwasthyaSetu</Text></View>;
}

export default function RootLayout(): React.ReactNode {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await initDb();
      releaseStale();
      setLocale("hi");
      await restoreSession();
      setReady(true);
    })();
  }, []);

  useEffect(() => startSyncDaemon(), []);

  if (!ready) return <Splash />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OfflineStrip />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </SafeAreaProvider>
  );
}
