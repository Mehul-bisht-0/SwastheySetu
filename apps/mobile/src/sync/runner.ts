import { isOnline, onConnectivityChange } from "./netStatus.ts";
import { getSession } from "../state/session.ts";
import { claimBatch, applyResults, releaseBatch, counts } from "../db/dao/outbox.ts";
import { replaceCache } from "../db/dao/facilities.ts";
import { api } from "../api/client.ts";
import { getDb } from "../db/client.ts";
import type { AppStateStatus } from "react-native";
import { AppState } from "react-native";

export type SyncReason = "foreground" | "connectivity" | "timer" | "manual";
export interface SyncSummary { pushed: number; rejected: number; skipped?: string; error?: string; }
export interface SyncState { pending: number; rejected: number; running: boolean; lastPushAt: string | null; lastError: string | null; }

let running = false;
let lastSummary: SyncSummary = { pushed: 0, rejected: 0 };
const listeners = new Set<(s: SyncState) => void>();
let state: SyncState = { pending: 0, rejected: 0, running: false, lastPushAt: null, lastError: null };
function notify() { listeners.forEach((fn) => fn({ ...state })); }

export async function runSync(reason: SyncReason): Promise<SyncSummary> {
  if (running) return lastSummary;
  running = true;
  state = { ...state, running: true };
  notify();
  try {
    if (!(await isOnline())) return (lastSummary = { pushed: 0, rejected: 0, skipped: "offline" });
    if (!getSession()) return (lastSummary = { pushed: 0, rejected: 0, skipped: "signed out" });
    let pushed = 0, rejected = 0;
    for (;;) {
      const batch = claimBatch(50);
      if (batch.length === 0) break;
      try {
        const res = await api.post<{ results: Array<{ clientOpId: string; status: string; errorCode?: string }> }>("/sync/push", { deviceId: "mobile-device", operations: batch.map((b) => ({ clientOpId: b.clientOpId, opType: b.opType, clientCreatedAt: b.clientCreatedAt, payload: b.payload })) });
        if (res.ok && res.data) {
          applyResults(res.data.results);
          pushed += res.data.results.filter((r) => r.status === "APPLIED" || r.status === "DUPLICATE").length;
          rejected += res.data.results.filter((r) => r.status === "REJECTED").length;
        } else { releaseBatch(batch.map((b) => b.clientOpId), res.error?.message ?? "error"); break; }
      } catch (e) { releaseBatch(batch.map((b) => b.clientOpId), String(e)); break; }
    }
    await pullReferenceData();
    const now = new Date().toISOString();
    state = { ...state, lastPushAt: now, lastError: null, ...counts() };
    notify();
    return (lastSummary = { pushed, rejected });
  } catch (e) {
    state = { ...state, lastError: String(e) };
    notify();
    return (lastSummary = { pushed: 0, rejected: 0, error: String(e) });
  } finally {
    running = false;
    state = { ...state, running: false, ...counts() };
    notify();
  }
}

export async function pullReferenceData(): Promise<void> {
  const db = getDb();
  const cursorRow = db.getFirstSync("SELECT value FROM app_meta WHERE key='sync.pullCursor'") as { value: string } | null;
  const params = cursorRow ? "?cursor=" + encodeURIComponent(cursorRow.value) : "";
  const res = await api.get<{ facilities: { items: unknown[] }; villages: { items: unknown[] }; travelTimes: { items: unknown[] }; serverTime: string }>("/sync/pull" + params);
  if (!res.ok || !res.data) return;
  replaceCache(res.data.facilities.items as Parameters<typeof replaceCache>[0], res.data.villages.items, res.data.travelTimes.items);
  db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('sync.pullCursor',?)", [res.data.serverTime]);
}

export function startSyncDaemon(): () => void {
  const timerId = setInterval(() => { void runSync("timer"); }, 5 * 60 * 1000);
  const unsub = onConnectivityChange((online) => { if (online) void runSync("connectivity"); });
  const appSub = AppState.addEventListener("change", (s: AppStateStatus) => { if (s === "active") void runSync("foreground"); });
  return () => { clearInterval(timerId); unsub(); appSub.remove(); };
}

export function subscribe(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}
