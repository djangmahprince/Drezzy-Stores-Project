import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireConfig } from "@/lib/supabase/config";

/** A Supabase client acting as the signed-in user, so row-level security applies. Create one per request. */
export async function createClient() {
  const { url, key } = requireConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
