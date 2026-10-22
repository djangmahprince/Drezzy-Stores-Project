import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireConfig } from "@/lib/supabase/config";

/**
 * Service-role client. It BYPASSES row-level security, so it is only for work no signed-in user can do:
 * creating or banning a login. Always check the caller's permission first (see lib/auth.ts), and do the actual
 * data writes with the user's own client so the audit log records who did it.
 */
export function createAdminClient() {
  const { url } = requireConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
