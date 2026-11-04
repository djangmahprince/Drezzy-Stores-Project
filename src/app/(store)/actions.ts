"use server";

import { clientKey, limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Shopper actions that do not need an account. Each one calls a narrow database function that checks everything itself
 * (an order number plus the phone used at checkout, or the signed-in account). These only add a per-visitor rate limit
 * and plain-language errors.
 */
export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const offline: Result = { ok: false, error: "This works once the shop is connected." };
const clean = (m?: string) => (m && m.length < 160 && !/violates|constraint|function|permission|syntax|relation/i.test(m) ? m : "Something went wrong. Please try again.");

async function guard(bucket: string, max: number): Promise<Result | null> {
  if (!isSupabaseConfigured) return offline;
  if (limited(bucket, await clientKey(), max, 60_000)) return { ok: false, error: "Please wait a minute and try again." };
  return null;
}

export async function notifyMeAction(email: string, productId: string, size: string | null, kind: "restock" | "drop"): Promise<Result> {
  const g = await guard("notify", 10);
  if (g) return g;
  const { error } = await (await createClient()).rpc("request_stock_alert", { p_email: email, p_product: productId, p_size: size, p_kind: kind });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

export async function newsletterAction(email: string, placement: string): Promise<Result> {
  const g = await guard("newsletter", 5);
  if (g) return g;
  const { error } = await (await createClient()).rpc("newsletter_subscribe", { p_email: email, p_placement: placement.slice(0, 40) });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

export async function unsubscribeAction(token: string): Promise<Result> {
  const g = await guard("unsub", 10);
  if (g) return g;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: "That link is not valid." };
  const { data, error } = await (await createClient()).rpc("newsletter_unsubscribe", { p_token: token });
  return error ? { ok: false, error: clean(error.message) } : data ? { ok: true } : { ok: false, error: "You were already unsubscribed." };
}

export async function couponAction(code: string, subtotal: number, phone?: string): Promise<Result<{ code: string; discount: number }>> {
  const g = await guard("coupon", 20);
  if (g) return g as Result<{ code: string; discount: number }>;
  const { data, error } = await (await createClient()).rpc("check_coupon", { p_code: code, p_subtotal: subtotal, p_phone: phone || null });
  if (error) return { ok: false, error: clean(error.message) };
  const d = data as { ok: boolean; message?: string; code?: string; discount?: number };
  return d.ok ? { ok: true, data: { code: d.code!, discount: Number(d.discount) } } : { ok: false, error: d.message ?? "That code is not valid." };
}

export type ReviewInput = { number: string; phone?: string; product: string; rating: number; title?: string; body: string; displayName?: string; consent: boolean; photos?: string[] };
export async function reviewAction(r: ReviewInput): Promise<Result> {
  const g = await guard("review", 6);
  if (g) return g;
  const { error } = await (await createClient()).rpc("submit_review", {
    p: { number: r.number, phone: r.phone ?? null, product: r.product, rating: r.rating, title: r.title ?? null, body: r.body, display_name: r.displayName ?? null, consent: r.consent, photos: r.photos ?? [] },
  });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

export async function orderFeedbackAction(number: string, phone: string, rating: number, comment?: string): Promise<Result> {
  const g = await guard("order-feedback", 6);
  if (g) return g;
  const { error } = await (await createClient()).rpc("submit_feedback", { p_number: number, p_phone: phone, p_rating: rating, p_comment: comment ?? null });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

export type Thread = { id: string; subject: string; status: string; order: string | null; messages: { from_staff: boolean; name: string; body: string; at: string }[] };

export async function supportThreadsAction(number?: string, phone?: string): Promise<Result<Thread[]>> {
  const g = await guard("support-read", 30);
  if (g) return g as Result<Thread[]>;
  const { data, error } = await (await createClient()).rpc("support_threads_for", { p_number: number ?? null, p_phone: phone ?? null });
  return error ? { ok: false, error: clean(error.message) } : { ok: true, data: (data ?? []) as Thread[] };
}

export async function supportPostAction(m: { number?: string; phone?: string; thread?: string; subject?: string; body: string; complaint?: boolean }): Promise<Result> {
  const g = await guard("support-post", 8);
  if (g) return g;
  const { error } = await (await createClient()).rpc("support_post", { p: { number: m.number ?? null, phone: m.phone ?? null, thread: m.thread ?? null, subject: m.subject ?? null, body: m.body, complaint: !!m.complaint } });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

export async function dataRequestAction(kind: string, details: string, email?: string, phone?: string): Promise<Result> {
  const g = await guard("data-request", 3);
  if (g) return g;
  const { error } = await (await createClient()).rpc("request_data_action", { p_kind: kind, p_details: details, p_email: email ?? null, p_phone: phone ?? null });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}

/** Remember the bag for a reminder email, only when the shopper ticked "remind me" (abandoned cart, with consent). */
export async function checkoutDraftAction(email: string, session: string, items: { slug: string; size: string; qty: number }[], consent: boolean): Promise<Result> {
  const g = await guard("draft", 10);
  if (g) return g;
  const { error } = await (await createClient()).rpc("save_checkout_draft", { p_email: email, p_session: session, p_items: items.slice(0, 20), p_consent: consent });
  return error ? { ok: false, error: clean(error.message) } : { ok: true };
}
