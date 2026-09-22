import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { reset } from "../../src/state/triageDraft.ts";

/** Public by design: urgent symptom checking must never require an account. */
export default function CitizenLayout(): React.ReactNode {
  useEffect(() => { reset(); }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
