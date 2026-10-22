import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireConfig } from "@/lib/supabase/config";

/**
 * A Supabase client with no user session, for public reads such as the storefront catalogue. It uses the publishable key,
 * so the database only returns what shoppers are allowed to see (published products, public columns).
 * Because it never reads cookies, its results can be cached and shared.
 */
export function createPublicClient() {
  const { url, key } = requireConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
