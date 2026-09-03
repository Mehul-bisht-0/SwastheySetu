import React, { useEffect } from "react";
import { useRouter, Stack } from "expo-router";
import { getSession } from "../../src/state/session.ts";
import { QueueBadge } from "../../src/ui/QueueBadge.tsx";
import { View } from "react-native";

export default function AshaLayout(): React.ReactNode {
  const router = useRouter();
  useEffect(() => {
    if (!getSession()) router.replace("/(asha)/login");
  }, []);
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerRight: () => <View style={{ marginRight: 12 }}><QueueBadge /></View>,
      }}
    />
  );
}
