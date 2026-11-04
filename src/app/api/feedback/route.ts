import { limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

/** On-site feedback (FR-AN-009). Anonymous; read by staff with analytics access. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return new Response(null, { status: 204 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited("feedback", ip, 5, 60_000)) return new Response("Too many messages", { status: 429 });
  let b: { page?: unknown; message?: unknown; rating?: unknown };
  try {
    b = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const rating = typeof b.rating === "number" && b.rating >= 1 && b.rating <= 5 ? Math.round(b.rating) : null;
  const { error } = await createPublicClient().rpc("send_site_feedback", {
    p_page: typeof b.page === "string" ? b.page.slice(0, 200) : null, p_message: typeof b.message === "string" ? b.message : "", p_rating: rating, p_email: null,
  });
  return error ? new Response(error.message, { status: 400 }) : new Response(null, { status: 204 });
}
