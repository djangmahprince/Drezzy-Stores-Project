import { limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

const legacy: Record<string, string> = { visit: "page_view", product_view: "view_item", add_to_cart: "add_to_cart", checkout_started: "begin_checkout" };

/**
 * Records anonymous analytics events (PRD section 24). The database checks every name against the tracking plan, caps
 * the batch, and mirrors funnel steps into one row per visitor per step per day, so refreshing cannot inflate the funnel.
 * Accepts { events: [...] } (current) or { session, name } (older clients).
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return new Response(null, { status: 204 });
  let body: { events?: unknown; session?: unknown; name?: unknown; source?: unknown };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited("track-event", ip, 240, 60_000)) return new Response(null, { status: 429 });

  let events: unknown[] = [];
  if (Array.isArray(body.events)) events = body.events.slice(0, 25);
  else if (typeof body.session === "string" && typeof body.name === "string" && legacy[body.name]) {
    events = [{ session: body.session, name: legacy[body.name], utm_source: typeof body.source === "string" ? body.source : undefined }];
  }
  if (!events.length) return new Response(null, { status: 400 });
  // the shopper's region comes from the CDN, never from what the browser says
  const region = request.headers.get("x-vercel-ip-country-region");
  const withRegion = events.map((e) => (e && typeof e === "object" ? { ...(e as object), region: region ?? undefined } : e));
  await createPublicClient().rpc("track_events", { p_events: withRegion });
  return new Response(null, { status: 204 });
}
