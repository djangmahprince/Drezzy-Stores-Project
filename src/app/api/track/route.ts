import { limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

const names = new Set(["visit", "product_view", "add_to_cart", "checkout_started"]);

/** Records an anonymous funnel step. The database keeps one row per visitor per step per day. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return new Response(null, { status: 204 });
  let body: { session?: unknown; name?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { session, name, source } = body;
  if (typeof session !== "string" || typeof name !== "string" || !names.has(name)) return new Response(null, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited("track-event", ip, 120, 60_000)) return new Response(null, { status: 429 });
  await createPublicClient().rpc("track_event", { p_session: session.slice(0, 64), p_name: name, p_source: typeof source === "string" ? source.slice(0, 40) : null });
  return new Response(null, { status: 204 });
}
