import React, { useState, useEffect } from "react";
import { Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { subscribe, type SyncState } from "../sync/runner.ts";
import { ink, system } from "../theme/tokens.ts";
import { t } from "../i18n/strings.ts";

export function QueueBadge(): React.ReactNode {
  const [state, setState] = useState<SyncState | null>(null);
  const router = useRouter();
  useEffect(() => subscribe(setState), []);
  if (!state || (state.pending === 0 && state.rejected === 0)) return null;
  const color = state.rejected > 0 ? system.failed : ink.body;
  const label = state.rejected > 0
    ? t("sync.failed", { n: state.rejected })
    : t("sync.queued", { n: state.pending });
  return <Pressable onPress={() => router.push("/(asha)/queue")}><Text style={{ color, fontSize: 15 }}>{label}</Text></Pressable>;
}