import * as SecureStore from "expo-secure-store";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000");
export const TOKEN_KEY = "auth_token";

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; fields?: unknown };
}

export async function request<T>(
  path: string,
  opts?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number; auth?: boolean; tokenKey?: string },
): Promise<Envelope<T>> {
  const method = opts?.method ?? "GET";
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts?.auth !== false) {
      // Inside the try: SecureStore throws on an unavailable keychain, and the
      // timer used to be created before this point, so it leaked on that path.
      const token = await SecureStore.getItemAsync(opts?.tokenKey ?? TOKEN_KEY);
      if (token) headers["Authorization"] = "Bearer " + token;
    }
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(BASE + path, {
      method, headers,
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    return (await res.json()) as Envelope<T>;
  } catch (e) {
    // Callers are typed against Envelope and check `res.ok`; rejecting instead
    // would break that contract and surface a raw JS error string in the UI.
    return { ok: false, error: { code: "NETWORK", message: String(e) } };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const api = {
  get<T>(path: string): Promise<Envelope<T>> { return request<T>(path, { method: "GET" }); },
  post<T>(path: string, body: unknown): Promise<Envelope<T>> { return request<T>(path, { method: "POST", body }); },
};
