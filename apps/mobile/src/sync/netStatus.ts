import * as Network from "expo-network";

export type ConnectivityState = "OFFLINE" | "LIMITED" | "ONLINE";

export async function getConnectivityState(): Promise<ConnectivityState> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || state.isInternetReachable === false) return "OFFLINE";
    if (state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET) return "ONLINE";
    return "LIMITED";
  } catch { return "OFFLINE"; }
}

export async function isOnline(): Promise<boolean> {
  return (await getConnectivityState()) !== "OFFLINE";
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  let active = true;
  const poll = () => isOnline().then((v) => { if (active) fn(v); });
  const id = setInterval(() => { void poll(); }, 15000);
  return () => { active = false; clearInterval(id); };
}

export function onConnectivityStateChange(fn: (state: ConnectivityState) => void): () => void {
  let active = true;
  const poll = () => getConnectivityState().then((state) => { if (active) fn(state); });
  const id = setInterval(() => { void poll(); }, 15000);
  return () => { active = false; clearInterval(id); };
}
