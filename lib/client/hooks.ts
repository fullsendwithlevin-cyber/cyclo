"use client";

import { useSyncExternalStore } from "react";

/** Aktuelle Zeit, minütlich aktualisiert (rein für Anzeigezwecke; kein Date.now() im Render). */
let now = Date.now();
const nowListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (!timer)
    timer = setInterval(() => {
      now = Date.now();
      nowListeners.forEach((l) => l());
    }, 60_000);
  return () => {
    nowListeners.delete(cb);
    if (!nowListeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribeNow, () => now, () => now);
}

/** Beobachtet die „dark“-Klasse am <html>-Element. */
function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function useIsDark(): boolean | null {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );
}

const noopSubscribe = () => () => undefined;

/** Wert, der nur im Browser berechnet werden kann (Server: Fallback). */
export function useClientValue<T>(compute: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, compute, () => serverValue);
}
