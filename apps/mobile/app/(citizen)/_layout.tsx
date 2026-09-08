import React, { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { reset } from "../../src/state/triageDraft.ts";
import { getPatientSession, subscribePatient } from "../../src/state/patientSession.ts";

export default function CitizenLayout(): React.ReactNode {
  const router = useRouter();
  const [patient, setPatient] = useState(getPatientSession());

  useEffect(() => { reset(); }, []);
  useEffect(() => subscribePatient(setPatient), []);
  useEffect(() => {
    if (!patient) router.replace("/(patient)/login");
  }, [patient, router]);

  if (!patient) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
