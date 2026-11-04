import { runNotifications } from "@/lib/notify/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The scheduled checks (every 15 minutes): stuck orders, late suppliers, unchecked availability, missing daily reports,
 * pace and budget alerts, delivery feedback, drop reminders, checkout reminders, report emails, retention.
 * The rules live in the database (run_scheduled_checks); this route only starts them, then cleans up expired export files
 * and sends whatever the checks queued.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ ok: true, skipped: "Supabase is not connected" });

  const db = createAdminClient();
  const { data, error } = await db.rpc("run_scheduled_checks");
  if (error) return new Response("Checks failed", { status: 500 });

  // exports are kept for 24 hours only (FR-DATA-006)
  const { data: expired } = await db.from("export_jobs").select("id, path").eq("status", "expired").not("path", "is", null).limit(200);
  const paths = (expired ?? []).map((e: { path: string }) => e.path);
  if (paths.length) {
    await db.storage.from("exports").remove(paths);
    await db.from("export_jobs").update({ path: null }).in("id", (expired ?? []).map((e: { id: string }) => e.id));
  }

  let sent = { sent: 0, failed: 0 };
  try {
    sent = await runNotifications(50);
  } catch {
    // the notifications route retries on its own schedule
  }
  return Response.json({ ok: true, checks: data, removedExports: paths.length, ...sent });
}
