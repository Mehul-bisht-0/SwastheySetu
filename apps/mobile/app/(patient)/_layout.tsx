import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { getPatientSession, subscribePatient } from "../../src/state/patientSession.ts";
import { syncPatientOperations } from "../../src/connectivity/patient.ts";

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
  useEffect(() => {
    if (!session) return;
    const send = () => { void syncPatientOperations(); };
    send();
    const timer = setInterval(send, 300_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") send(); });
    return () => { clearInterval(timer); appState.remove(); };
  }, [session]);
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
