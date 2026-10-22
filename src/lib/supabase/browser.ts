"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, key } = requireConfig();
  return createBrowserClient(url, key);
}
