import "server-only";
import { renderOrderMail } from "@/lib/notify/templates";
import { createAdminClient } from "@/lib/supabase/admin";

type Queued = { id: number; template: string; to_address: string; payload: { number: string; name: string; headline: string; total: number; paid: number; balance: number } };

/** Resend's send API. Returns an error message, or null when the provider accepted the email. */
async function sendEmail(to: string, mail: { subject: string; text: string; html: string }): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  return res.ok ? null : `Provider said ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

/** Sends one batch from the outbox and reports each result back, so a failure is retried later. */
export async function runNotifications(limit = 20): Promise<{ sent: number; failed: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error("Could not read the outbox");
  const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Queued[]) {
    let problem: string | null;
    try {
      problem = await sendEmail(row.to_address, renderOrderMail(row.template, { ...row.payload, total: Number(row.payload.total), paid: Number(row.payload.paid), balance: Number(row.payload.balance) }, site));
    } catch (e) {
      problem = e instanceof Error ? e.message : "Send failed";
    }
    await db.rpc("finish_notification", { p_id: row.id, p_ok: problem === null, p_error: problem });
    if (problem === null) sent++;
    else failed++;
  }
  return { sent, failed };
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM);
