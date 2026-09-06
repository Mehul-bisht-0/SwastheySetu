import React, { useEffect, useState } from "react";
import { useRouter, useSegments, Stack } from "expo-router";
import { getSession, subscribe } from "../../src/state/session.ts";
import { QueueBadge } from "../../src/ui/QueueBadge.tsx";
import { View } from "react-native";

export default function AshaLayout(): React.ReactNode {
  const router = useRouter();
  const segments = useSegments();
  const isLogin = segments[segments.length - 1] === "login";
  const [session, setSession] = useState(getSession);
  useEffect(() => subscribe(setSession), []);
  useEffect(() => {
    if (!session && !isLogin) router.replace("/(asha)/login");
  }, [session, isLogin, router]);
  if (!session && !isLogin) return null;
  return (
    <Stack screenOptions={{
      headerShown: true,
      headerRight: () => <View style={{ marginRight: 12 }}><QueueBadge /></View>,
    }} />
  );
}
