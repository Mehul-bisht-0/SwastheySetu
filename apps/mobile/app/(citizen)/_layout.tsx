import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { reset } from "../../src/state/triageDraft.ts";

export default function CitizenLayout(): React.ReactNode {
  useEffect(() => { reset(); }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
