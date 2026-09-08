import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { getPatientSession, subscribePatient } from "../../src/state/patientSession.ts";

export default function PatientLayout(): React.ReactNode {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState(getPatientSession());
  const page = segments[segments.length - 1];
  const publicPage = page === "login" || page === "register";
  useEffect(() => subscribePatient(setSession), []);
  useEffect(() => {
    if (!session && !publicPage) router.replace("/(patient)/login");
    if (session && publicPage) router.replace("/(patient)/home");
  }, [session, publicPage, router]);
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
