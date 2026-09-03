import * as Network from "expo-network";

export async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return Boolean(s.isConnected && s.isInternetReachable !== false);
  } catch { return false; }
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  let active = true;
  const poll = () => isOnline().then((v) => { if (active) fn(v); });
  const id = setInterval(() => { void poll(); }, 15000);
  return () => { active = false; clearInterval(id); };
}