"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { ErrorInfo } from "@/lib/errors";

export class ApiError extends Error implements ErrorInfo {
  code: ErrorInfo["code"];
  action: string;
  reason: string;
  solution?: string;
  status: number;
  constructor(info: ErrorInfo, status: number) {
    super(`${info.action}: ${info.reason}`);
    this.code = info.code;
    this.action = info.action;
    this.reason = info.reason;
    this.solution = info.solution;
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    // Vollständiger Reload beabsichtigt: verwirft Client-Zustand der abgelaufenen Sitzung
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = `/login?returnTo=${encodeURIComponent(location.pathname)}`;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? { code: "INTERNAL", action: "Anfrage", reason: `HTTP ${res.status}` }, res.status);
  return json as T;
}

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
  });
  return handle<T>(res);
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(path, (p: string) => apiFetch<T>(p), { revalidateOnFocus: true, ...config });
}

/** Liest einen NDJSON-Stream (Agent-Events) und ruft `onEvent` je Zeile auf. */
export async function streamNdjson(path: string, body: unknown, onEvent: (e: Record<string, unknown>) => void, signal?: AbortSignal) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal, credentials: "same-origin" });
  if (!res.ok || !res.body) {
    await handle(res);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}
