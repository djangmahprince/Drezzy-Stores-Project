"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny external store with optional localStorage persistence.
 * Reads and writes are wrapped because storage can be blocked (private windows, strict settings).
 */
export function createStore<T>(initial: T, persistKey?: string) {
  let state = initial;
  let loaded = !persistKey;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(persistKey!);
      if (raw) state = { ...initial, ...JSON.parse(raw) };
    } catch {
      /* storage unavailable or corrupt, keep the default */
    }
    // keep tabs in sync
    window.addEventListener("storage", (e) => {
      if (e.key !== persistKey) return;
      try {
        state = e.newValue ? { ...initial, ...JSON.parse(e.newValue) } : initial;
        emit();
      } catch {
        /* ignore */
      }
    });
  };

  const store = {
    subscribe(listener: () => void) {
      load();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get() {
      load();
      return state;
    },
    server: () => initial,
    set(next: T | ((prev: T) => T)) {
      load();
      state = typeof next === "function" ? (next as (p: T) => T)(state) : next;
      if (persistKey) {
        try {
          window.localStorage.setItem(persistKey, JSON.stringify(state));
        } catch {
          /* ignore */
        }
      }
      emit();
    },
  };
  return store;
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.server);
}
