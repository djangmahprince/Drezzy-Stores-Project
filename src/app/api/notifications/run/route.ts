import { channelsReady, runNotifications } from "@/lib/notify/send";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Sends the queued customer and staff messages. Called on a schedule (Vercel Cron sends the CRON_SECRET as a Bearer token).
 * Without the secret nobody can trigger it. Channels without a provider (email, SMS, WhatsApp) are left queued.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!isSupabaseConfigured || channelsReady().length === 0) return Response.json({ ok: true, skipped: "No message provider is set up yet" });
  try {
    return Response.json({ ok: true, ...(await runNotifications()) });
  } catch {
    return new Response("Could not send", { status: 500 });
  }
}
