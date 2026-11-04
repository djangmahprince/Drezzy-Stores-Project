"use client";

import { useSyncExternalStore } from "react";

// The current time for client components, refreshed every 30 seconds. Null on the server and during hydration, so a
// prerendered page never contains a time that would differ from the browser's.
let now = 0;
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export const useNow = (): number | null => useSyncExternalStore(subscribe, () => now || null, () => null);
