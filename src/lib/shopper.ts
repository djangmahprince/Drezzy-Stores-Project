"use client";

// Is a shopper signed in on this device? Read once from the Supabase session in the browser, then kept in a small store.
// Used to save wishlist hearts to the account (for alerts) and to pre-fill checkout. Staff sessions are treated as guests.
import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createStore, useStore } from "@/lib/store";

const shopper = createStore<{ ready: boolean; signedIn: boolean; email: string | null }>({ ready: false, signedIn: false, email: null });
let started = false;

export async function refreshShopper() {
  if (!isSupabaseConfigured) return shopper.set({ ready: true, signedIn: false, email: null });
  try {
    const { createClient } = await import("@/lib/supabase/browser");
    const { data } = await createClient().auth.getSession();
    const email = data.session?.user.email ?? null;
    shopper.set({ ready: true, signedIn: !!data.session, email });
  } catch {
    shopper.set({ ready: true, signedIn: false, email: null });
  }
}

export function useShopper() {
  const s = useStore(shopper);
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshShopper();
  }, []);
  return s;
}
