import * as SecureStore from "expo-secure-store";
import { getDb } from "../db/client.ts";
import { api, TOKEN_KEY, request } from "../api/client.ts";
import { refreshAshaVillages } from "../api/asha.ts";
import { getDeviceId } from "./device.ts";

export interface Session {
  ashaId: string;
  name: string;
  districtCode: string;
  role: "ASHA" | "SUPERVISOR" | "ADMIN";
}

let session: Session | null = null;
const listeners: Set<(s: Session | null) => void> = new Set();
function notify() { listeners.forEach((fn) => fn(session)); }

export async function restoreSession(): Promise<Session | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return null;
    const db = getDb();
    const ashaId = (db.getFirstSync("SELECT value FROM app_meta WHERE key='session.ashaId'") as { value: string } | null)?.value;
    const name = (db.getFirstSync("SELECT value FROM app_meta WHERE key='session.name'") as { value: string } | null)?.value;
    const districtCode = (db.getFirstSync("SELECT value FROM app_meta WHERE key='session.district'") as { value: string } | null)?.value;
    const storedRole = (db.getFirstSync("SELECT value FROM app_meta WHERE key='session.role'") as { value: string } | null)?.value;
    if (!ashaId || !districtCode) return null;
    const role = storedRole === "SUPERVISOR" || storedRole === "ADMIN" ? storedRole : "ASHA";
    session = { ashaId, name: name ?? "", districtCode, role };
    notify();
    return session;
  } catch { return null; }
}

export async function signIn(phone: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await request<{ accessToken: string; user: { userId: string; fullName: string; districtCode: string; role: "ASHA" | "SUPERVISOR" | "ADMIN" } }>(
      "/auth/login",
      { method: "POST", body: { phone, password, deviceId: getDeviceId(), platform: "android", appVersion: "0.1.0" }, auth: false },
    );
    if (!res.ok || !res.data) return { ok: false, error: res.error?.message };
    const db = getDb();
    const owner = db.getFirstSync<{ value: string }>("SELECT value FROM app_meta WHERE key='session.ashaId'")?.value;
    if (owner && owner !== res.data.user.userId) {
      return { ok: false, error: "This phone contains another worker's records. Use a separate app installation." };
    }
    await SecureStore.setItemAsync(TOKEN_KEY, res.data.accessToken);
    db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('session.ashaId',?)", [res.data.user.userId]);
    db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('session.name',?)", [res.data.user.fullName]);
    db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('session.district',?)", [res.data.user.districtCode]);
    db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('session.role',?)", [res.data.user.role]);
    session = { ashaId: res.data.user.userId, name: res.data.user.fullName, districtCode: res.data.user.districtCode, role: res.data.user.role };
    notify();
    try { await refreshAshaVillages(); } catch { /* The authenticated session remains usable offline. */ }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  session = null;
  notify();
}

export function getSession(): Session | null { return session; }

export function subscribe(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
