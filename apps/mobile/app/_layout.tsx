import React, { useState, useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text } from "react-native";
import { initDb } from "../src/db/client.ts";
import { releaseStale } from "../src/db/dao/outbox.ts";
import { setLocale } from "../src/i18n/strings.ts";
import { restoreSession } from "../src/state/session.ts";
import { restorePatientSession } from "../src/state/patientSession.ts";
import { startSyncDaemon } from "../src/sync/runner.ts";
import { OfflineStrip } from "../src/ui/OfflineStrip.tsx";
import { paper } from "../src/theme/tokens.ts";

function Splash(): React.ReactNode {
  return <View style={{ flex: 1, backgroundColor: paper.base, alignItems: "center", justifyContent: "center" }}><Text>SwasthyaSetu</Text></View>;
}

// A boot failure used to leave the app on Splash forever: the async IIFE below
// was fire-and-forget, so a throw became an unhandled rejection and `ready` was
// never set. That is indistinguishable from a hang on a phone with no console.
// Every failure now reaches the screen instead.
function BootError({ message }: { message: string }): React.ReactNode {
  return (
    <View style={{ flex: 1, backgroundColor: paper.base, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontWeight: "700", marginBottom: 8 }}>SwasthyaSetu could not start</Text>
      <Text style={{ textAlign: "center" }}>{message}</Text>
    </View>
  );
}

export default function RootLayout(): React.ReactNode {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await initDb();
        releaseStale();
        setLocale("en");
        await restoreSession();
        await restorePatientSession();
      } catch (e) {
        setBootError(String(e));
      } finally {
        // Always leave the splash, even on failure, so the error is visible.
        setReady(true);
      }
    })();
  }, []);

  // Registered only after the database exists: the sync daemon's callbacks read
  // it, and they used to be able to fire while initDb() was still in flight.
  useEffect(() => {
    if (!ready || bootError) return;
    return startSyncDaemon();
  }, [ready, bootError]);

  if (!ready) return <Splash />;
  if (bootError) return <BootError message={bootError} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OfflineStrip />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </SafeAreaProvider>
  );
}
