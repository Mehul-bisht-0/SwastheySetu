import { isOnline, onConnectivityChange } from "./netStatus.ts";
import { getSession } from "../state/session.ts";
import { claimBatch, applyResults, releaseBatch, counts } from "../db/dao/outbox.ts";
import { replaceCache } from "../db/dao/facilities.ts";
import { api } from "../api/client.ts";
import { refreshPublicFacilityCache } from "../api/facilityCache.ts";
import { getDb } from "../db/client.ts";
import type { AppStateStatus } from "react-native";
import { AppState } from "react-native";
import { sync as syncContracts } from "@swasthyasetu/contracts";
import { getDeviceId } from "../state/device.ts";

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
    if (!getSession()) {
      await refreshPublicFacilityCache();
      return (lastSummary = { pushed: 0, rejected: 0, skipped: "signed out" });
    }
    let pushed = 0, rejected = 0;
    for (;;) {
      // A person pressing Send now is an explicit retry. Automatic sync still
      // observes exponential backoff so an unavailable API is not hammered.
      const batch = claimBatch(50, reason === "manual");
      if (batch.length === 0) break;
      try {
        const res = await api.post<unknown>("/sync/push", { deviceId: getDeviceId(), operations: batch.map((b) => ({ clientOpId: b.clientOpId, opType: b.opType, clientCreatedAt: b.clientCreatedAt, payload: b.payload,
          ...(b.opType === "HOUSEHOLD_VISIT_UPSERT" && typeof b.payload === "object" && b.payload !== null && "entityVersion" in b.payload ? { entityVersion: b.payload.entityVersion } : {}),
        })) });
        if (res.ok && res.data) {
          const data = syncContracts.pushResponse.parse(res.data);
          const expected = new Set(batch.map(b => b.clientOpId));
          if (data.results.length !== expected.size || new Set(data.results.map(r => r.clientOpId)).size !== expected.size || data.results.some(r => !expected.has(r.clientOpId))) throw new Error("Incomplete sync acknowledgement.");
          applyResults(data.results);
          pushed += data.results.filter((r) => r.status === "APPLIED" || r.status === "DUPLICATE").length;
          rejected += data.results.filter((r) => r.status === "REJECTED" || r.status === "CONFLICT").length;
        } else { throw new Error(res.error?.message ?? "Sync failed."); }
      } catch (e) { releaseBatch(batch.map((b) => b.clientOpId), String(e)); throw e; }
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
    // counts() reads the database, and a throw HERE would override the return
    // value and reject the promise past the catch above - every caller uses
    // `void runSync(...)`, so that surfaced as an unhandled rejection and left
    // subscribers stuck on running:true forever.
    let c = { pending: state.pending, rejected: state.rejected };
    try { c = counts(); } catch { /* database not ready; keep the last counts */ }
    state = { ...state, running: false, ...c };
    notify();
  }
}

export async function pullReferenceData(): Promise<void> {
  const db = getDb();
  const since = db.getFirstSync<{ value: string }>("SELECT value FROM app_meta WHERE key='sync.since'")?.value;
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (cursor) params.set("cursor", cursor);
    const res = await api.get<unknown>("/sync/pull?" + params.toString());
    if (!res.ok) throw new Error(res.error?.message ?? "Reference sync failed.");
    const data = syncContracts.pullResponse.parse(res.data);
    replaceCache(data.facilities.items.map(f => ({ ...f, type: f.facilityType, lat: f.latitude, lon: f.longitude })), data.villages.items, data.travelTimes.items);
    const next = data.facilities.nextCursor ?? data.villages.nextCursor ?? data.travelTimes.nextCursor;
    if (next !== null && next === cursor) throw new Error("Reference cursor did not advance.");
    cursor = next;
    // Commit a watermark only after every page was saved. A crash replays pages harmlessly.
    if (!cursor) db.runSync("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('sync.since',?)", [data.serverTime]);
  } while (cursor);
}

export function startSyncDaemon(): () => void {
  void runSync("foreground");
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
