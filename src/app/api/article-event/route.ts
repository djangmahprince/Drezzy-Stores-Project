import { limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

/** Per-article metrics (FR-JR-010): a view, a read (depth and seconds), a product click, an add to bag. Anonymous. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return new Response(null, { status: 204 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited("article-event", ip, 120, 60_000)) return new Response(null, { status: 429 });
  let b: { slug?: unknown; session?: unknown; kind?: unknown; product?: unknown; depth?: unknown; seconds?: unknown };
  try {
    b = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const session = typeof b.session === "string" ? b.session : request.headers.get("x-drezzy-session") ?? "";
  await createPublicClient().rpc("track_article", {
    p_slug: typeof b.slug === "string" ? b.slug.slice(0, 80) : "", p_session: session.slice(0, 64) || "anon-" + ip.replace(/[^0-9a-f]/gi, "").slice(0, 20).padEnd(8, "0"),
    p_kind: typeof b.kind === "string" ? b.kind : "", p_product: typeof b.product === "string" ? b.product.slice(0, 120) : null,
    p_depth: typeof b.depth === "number" ? Math.round(b.depth) : null, p_seconds: typeof b.seconds === "number" ? Math.round(b.seconds) : null,
  });
  return new Response(null, { status: 204 });
}
