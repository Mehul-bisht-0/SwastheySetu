import * as SecureStore from "expo-secure-store";
import { request } from "../api/client.ts";
import { getDeviceId } from "./device.ts";

export const PATIENT_TOKEN_KEY = "patient_auth_token";
const PATIENT_PROFILE_KEY = "patient_profile";

export interface PatientSession {
  patientId: string;
  phone: string;
  fullName: string;
  districtCode: string;
  homeAddress: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  verifiedAt: string | null;
}

let session: PatientSession | null = null;
const listeners = new Set<(value: PatientSession | null) => void>();

function notify(): void { listeners.forEach((listener) => listener(session)); }

async function save(accessToken: string, profile: PatientSession): Promise<void> {
  await SecureStore.setItemAsync(PATIENT_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(PATIENT_PROFILE_KEY, JSON.stringify(profile));
  session = profile;
  notify();
}

export async function restorePatientSession(): Promise<PatientSession | null> {
  try {
    const token = await SecureStore.getItemAsync(PATIENT_TOKEN_KEY);
    const profileText = await SecureStore.getItemAsync(PATIENT_PROFILE_KEY);
    if (!token || !profileText) return null;
    session = JSON.parse(profileText) as PatientSession;
    notify();
    return session;
  } catch { return null; }
}

export async function registerPatient(input: {
  phone: string; password: string; fullName: string; districtCode: string; homeAddress: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await request<{ accessToken: string; patient: PatientSession }>("/patients/register", {
    method: "POST", auth: false,
    body: { ...input, deviceId: getDeviceId(), platform: "android", appVersion: "0.1.0" },
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error?.message ?? "Registration failed." };
  await save(res.data.accessToken, res.data.patient);
  return { ok: true };
}

export async function loginPatient(phone: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await request<{ accessToken: string; patient: PatientSession }>("/patients/login", {
    method: "POST", auth: false,
    body: { phone, password, deviceId: getDeviceId(), platform: "android", appVersion: "0.1.0" },
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error?.message ?? "Sign-in failed." };
  await save(res.data.accessToken, res.data.patient);
  return { ok: true };
}

export async function updatePatientProfile(profile: PatientSession): Promise<void> {
  await SecureStore.setItemAsync(PATIENT_PROFILE_KEY, JSON.stringify(profile));
  session = profile;
  notify();
}

export async function signOutPatient(): Promise<void> {
  await SecureStore.deleteItemAsync(PATIENT_TOKEN_KEY);
  await SecureStore.deleteItemAsync(PATIENT_PROFILE_KEY);
  session = null;
  notify();
}

export function getPatientSession(): PatientSession | null { return session; }
export function subscribePatient(listener: (value: PatientSession | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
