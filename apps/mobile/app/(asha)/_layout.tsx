import React, { useEffect, useState } from "react";
import { useRouter, useSegments, Stack } from "expo-router";
import { getSession, subscribe } from "../../src/state/session.ts";
import { QueueBadge } from "../../src/ui/QueueBadge.tsx";
import { AppState, View } from "react-native";
import { syncDiagnosticSignals } from "../../src/connectivity/diagnosticSignals.ts";

export default function AshaLayout(): React.ReactNode {
  const router = useRouter();
  const segments = useSegments();
  const isLogin = segments[segments.length - 1] === "login";
  const [session, setSession] = useState(getSession);
  useEffect(() => subscribe(setSession), []);
  useEffect(() => {
    if (!session && !isLogin) router.replace("/(asha)/login");
  }, [session, isLogin, router]);
  useEffect(() => {
    if (!session) return;
    const send = () => { void syncDiagnosticSignals(); };
    send();
    const timer = setInterval(send, 300_000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") send(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [session]);
  if (!session && !isLogin) return null;
  return (
    <Stack screenOptions={{
      headerShown: true,
      headerRight: () => <View style={{ marginRight: 12 }}><QueueBadge /></View>,
    }} />
  );
}
