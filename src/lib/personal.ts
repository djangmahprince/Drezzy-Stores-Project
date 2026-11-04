"use client";

// Things a shopper's device remembers to personalise the shop: recently viewed products and the style quiz result.
// Kept on the device for guests; a signed-in shopper's quiz result is also saved to their account.
import { createStore, useStore } from "@/lib/store";

export type StyleProfile = { tags: string[]; shoe_size?: string; clothing_size?: string; audience?: "Men" | "Ladies" | "Both"; budget?: number; occasions?: string[] };

const recent = createStore<{ slugs: string[] }>({ slugs: [] }, "drezzy.recent.v1");
const style = createStore<{ profile: StyleProfile | null }>({ profile: null }, "drezzy.style.v1");

export function viewed(slug: string) {
  recent.set((s) => ({ slugs: [slug, ...s.slugs.filter((x) => x !== slug)].slice(0, 12) }));
}
export const useRecent = () => useStore(recent).slugs;
export const useStyleProfile = () => useStore(style).profile;
export const saveStyleProfile = (profile: StyleProfile) => style.set({ profile });
