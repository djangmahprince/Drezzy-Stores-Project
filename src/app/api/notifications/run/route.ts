import { emailConfigured, runNotifications } from "@/lib/notify/send";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Sends the queued customer emails. Called on a schedule (Vercel Cron sends the CRON_SECRET as a Bearer token).
 * Without the secret nobody can trigger it, and without an email provider it does nothing: the queue just waits.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!isSupabaseConfigured || !emailConfigured()) return Response.json({ ok: true, skipped: "Email is not set up yet" });
  try {
    return Response.json({ ok: true, ...(await runNotifications()) });
  } catch {
    return new Response("Could not send", { status: 500 });
  }
}
