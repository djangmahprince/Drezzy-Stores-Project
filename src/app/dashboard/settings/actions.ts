"use server";

import { updateTag } from "next/cache";
import { requireAction } from "@/lib/auth";
import { ZONES_TAG } from "@/lib/catalogue/tags";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { renderMessage } from "@/lib/notify/render";
import { emailConfigured, sendEmail, siteUrl } from "@/lib/notify/send";
import { createAdminClient } from "@/lib/supabase/admin";

export type ZoneInput = { region: string; fee: number; days: number; half: boolean; active: boolean; onArrival?: boolean };
export type ZoneResult = { ok: true } | { ok: false; error: string };

/** Changes what the shop charges and promises for a region. Row-level security also requires the settings permission. */
export async function saveZoneAction(z: ZoneInput): Promise<ZoneResult> {
  try {
    await requireAction("settings", "edit");
  } catch {
    return { ok: false, error: "You do not have permission to change delivery zones." };
  }
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  if (!Number.isFinite(z.fee) || z.fee < 0 || z.fee > 1000) return { ok: false, error: "Enter a fee between GHS 0 and 1,000." };
  if (!Number.isInteger(z.days) || z.days < 0 || z.days > 30) return { ok: false, error: "Delivery days must be a whole number from 0 to 30." };
  const { data, error } = await (await createClient())
    .from("delivery_zones")
    .update({ fee: Math.round(z.fee * 100) / 100, est_days: z.days, half_payment_allowed: z.half, active: z.active, fee_on_arrival: !!z.onArrival, updated_at: new Date().toISOString() })
    .eq("region", z.region)
    .select("region");
  if (error || !data?.length) return { ok: false, error: "Could not save. Please try again." };
  updateTag(ZONES_TAG);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rules and switches (alert thresholds, alert routes, delivery code, loyalty, leaderboard, reports, retention)
// ---------------------------------------------------------------------------

const KEYS = ["alerts", "delivery", "loyalty", "leaderboard", "retention", "alert_routes", "reports"];

export async function saveSettingAction(key: string, value: unknown): Promise<ZoneResult> {
  const me = await requireStaff();
  if (!KEYS.includes(key)) return { ok: false, error: "Unknown setting." };
  if (!can(me.permissions, "settings", "edit")) return { ok: false, error: "You cannot change settings." };
  // the leaderboard can push people to compete instead of helping each other, so only the Owner switches it on (PRD section 15)
  if (key === "leaderboard" && me.roleKey !== "owner") return { ok: false, error: "Only the Owner can switch the leaderboard on or off." };
  if (typeof value !== "object" || value === null || JSON.stringify(value).length > 5000) return { ok: false, error: "That value is not valid." };
  const { data, error } = await (await createClient()).from("app_settings").update({ value, updated_by: me.id, updated_at: new Date().toISOString() }).eq("key", key).select("key");
  return error || !data?.length ? { ok: false, error: "Could not save." } : { ok: true };
}

/** A partner login for a rider or courier agent (FR-TG-010): they see only their own jobs at /partner. */
export async function createPartnerLoginAction(riderId: string, email: string): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const me = await requireStaff();
  if (!(can(me.permissions, "orders", "edit") && me.permissions.orders?.scope === "all")) return { ok: false, error: "You cannot manage riders." };
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, error: "Enter the rider's email." };
  const supabase = await createClient();
  const { data: rider } = await supabase.from("riders").select("id, name, user_id").eq("id", riderId).maybeSingle();
  if (!rider) return { ok: false, error: "Rider not found." };
  if (rider.user_id) return { ok: false, error: "This rider already has a login." };
  const password = `${randomBytes(9).toString("base64url")}!4r`;
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true, user_metadata: { full_name: rider.name, partner: true } });
  if (error || !created.user) return { ok: false, error: error?.message.includes("already") ? "That email already has a login." : "Could not create the login." };
  const { error: linkError } = await supabase.from("riders").update({ user_id: created.user.id }).eq("id", riderId);
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Could not link the login to the rider." };
  }
  return { ok: true, password };
}

/** Sends a template to the signed-in person with sample values (FR-NT-001 test-send). */
export async function testSendAction(key: string, subject: string, body: string): Promise<ZoneResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "settings", "edit")) return { ok: false, error: "You cannot edit templates." };
  if (!emailConfigured()) return { ok: false, error: "Email is not set up yet (RESEND_API_KEY and NOTIFY_FROM)." };
  const sample = { number: "DRZ-1001", name: me.fullName, headline: "Out for delivery", total: 450, paid: 225, balance: 225, rider_name: "Kofi", rider_phone: "020 000 0000",
    delivery_code: "4821", product: "Nike Dunk", slug: "nike-dunk", size: "42", price: 400, was: 450, subject: "Your order", body: "Thanks for writing to us.", date: "today",
    orders: 4, sales: 1800, cash: 1500, owed: 300, stuck: 1, delivered: 12, on_time: "92%", reports: 18, score: 96, last: 88, wins: 3, misses: 1, kind: "orders", rows: 42,
    articles: [{ title: "5 ways to wear Nike Dunks", slug: "5-ways-to-wear-nike-dunks" }], token: "00000000-0000-0000-0000-000000000000" };
  const m = renderMessage(key, sample, siteUrl(), { subject, body });
  const err = await sendEmail(me.email, { ...m, subject: `[Test] ${m.subject}` });
  return err ? { ok: false, error: err } : { ok: true };
}
