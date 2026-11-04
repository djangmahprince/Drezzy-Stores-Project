import "server-only";
import { renderMessage, type Template } from "@/lib/notify/render";
import { createAdminClient } from "@/lib/supabase/admin";

type Queued = { id: number; channel: "email" | "sms" | "whatsapp"; template: string; to_address: string; payload: Record<string, unknown> };

/** Which channels can be sent right now. A channel without a provider simply waits; nothing is lost. */
export const channelsReady = () => {
  const c: string[] = [];
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_FROM) c.push("email");
  if (process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET && process.env.SMS_FROM) c.push("sms");
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE) c.push("whatsapp");
  return c;
};

export const emailConfigured = () => channelsReady().includes("email");

export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** Resend's send API. Returns an error message, or null when the provider accepted the email. */
export async function sendEmail(to: string, mail: { subject: string; text: string; html: string }): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok ? null : `Provider said ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

/** Hubtel SMS (Ghana). Phone numbers are stored as +233..., Hubtel takes them without the plus. */
async function sendSms(to: string, text: string): Promise<string | null> {
  const u = new URL("https://smsc.hubtel.com/v1/messages/send");
  u.searchParams.set("clientid", process.env.HUBTEL_CLIENT_ID!);
  u.searchParams.set("clientsecret", process.env.HUBTEL_CLIENT_SECRET!);
  u.searchParams.set("from", process.env.SMS_FROM!);
  u.searchParams.set("to", to.replace(/^\+/, ""));
  u.searchParams.set("content", text.slice(0, 459));
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  return res.ok ? null : `SMS provider said ${res.status}`;
}

/**
 * WhatsApp Business Platform (Cloud API). Business-initiated messages must use an approved utility template, so one
 * template (WHATSAPP_TEMPLATE) is sent with a single text parameter: the message's short form.
 */
async function sendWhatsApp(to: string, text: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template",
      template: { name: process.env.WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_LANG || "en" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 900) }] }] },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok ? null : `WhatsApp said ${res.status}: ${(await res.text()).slice(0, 160)}`;
}

/** The editable templates, by key. Switched-off templates fall back to the built-in wording. */
async function loadTemplates(db: ReturnType<typeof createAdminClient>): Promise<Record<string, Template>> {
  const { data } = await db.from("message_templates").select("key, subject, body, active");
  const out: Record<string, Template> = {};
  for (const t of (data ?? []) as { key: string; subject: string; body: string; active: boolean }[]) if (t.active) out[t.key] = { subject: t.subject, body: t.body };
  return out;
}

/** Sends one batch from the outbox and reports each result back, so a failure is retried later. */
export async function runNotifications(limit = 30): Promise<{ sent: number; failed: number; channels: string[] }> {
  const ready = channelsReady();
  if (ready.length === 0) return { sent: 0, failed: 0, channels: [] };
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_messages", { p_limit: limit, p_channels: ready });
  if (error) throw new Error("Could not read the outbox");
  const templates = await loadTemplates(db);
  const site = siteUrl();
  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Queued[]) {
    let problem: string | null;
    try {
      const m = renderMessage(row.template, row.payload ?? {}, site, templates[row.template]);
      problem = row.channel === "email" ? await sendEmail(row.to_address, m) : row.channel === "sms" ? await sendSms(row.to_address, m.short) : await sendWhatsApp(row.to_address, m.short);
    } catch (e) {
      problem = e instanceof Error ? e.message : "Send failed";
    }
    await db.rpc("finish_notification", { p_id: row.id, p_ok: problem === null, p_error: problem });
    if (problem === null) sent++;
    else failed++;
  }
  return { sent, failed, channels: ready };
}
