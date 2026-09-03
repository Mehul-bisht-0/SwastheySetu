import * as SecureStore from "expo-secure-store";

const BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000");
export const TOKEN_KEY = "auth_token";

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; fields?: unknown };
}

export async function request<T>(
  path: string,
  opts?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number; auth?: boolean },
): Promise<Envelope<T>> {
  const method = opts?.method ?? "GET";
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.auth !== false) {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) headers["Authorization"] = "Bearer " + token;
  }
  try {
    const res = await fetch(BASE + path, {
      method, headers,
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    return (await res.json()) as Envelope<T>;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get<T>(path: string): Promise<Envelope<T>> { return request<T>(path, { method: "GET" }); },
  post<T>(path: string, body: unknown): Promise<Envelope<T>> { return request<T>(path, { method: "POST", body }); },
};
