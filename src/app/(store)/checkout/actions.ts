"use server";

import { headers } from "next/headers";
import { paymentOptions } from "@/lib/payments/config";
import { startPayment } from "@/lib/payments/paystack";
import type { MomoNetwork } from "@/lib/payments/paystack-core";
import { placePayload } from "@/lib/orders/payload";
import { buildTrack, type TrackJson, type TrackView } from "@/lib/orders/track";
import type { NextStep, PayChoice, PlaceInput, PlaceResult, RetryResult } from "@/lib/orders/types";
import { clientKey, limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

/** The database raises plain-English messages for problems a customer can fix. Anything else is hidden behind a generic line. */
const customerMessage = (e: { code?: string; message: string }) =>
  e.code === "P0001" ? e.message : "Something went wrong on our side. Please try again, or WhatsApp us.";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
}

const isMomo = (m: PayChoice): m is MomoNetwork => m === "mtn" || m === "telecel" || m === "airtel";

async function begin(a: { method: PayChoice; email: string; phone: string; amount: number; reference: string; number: string }): Promise<NextStep> {
  const opts = paymentOptions();
  if (a.method === "manual_momo") {
    return opts.manual ? { type: "manual", ...opts.manual } : { type: "failed", message: "Manual MoMo is not available right now." };
  }
  if (!opts.paystack) return { type: "failed", message: "Online payment is not switched on yet. Please pay by manual MoMo, or WhatsApp us." };
  const out = await startPayment({
    method: isMomo(a.method) ? a.method : "card",
    email: a.email,
    phone: a.phone,
    amount: a.amount,
    reference: a.reference,
    callbackUrl: `${await origin()}/checkout/return?order=${encodeURIComponent(a.number)}`,
  });
  switch (out.next) {
    case "prompt": return { type: "prompt" };
    case "otp": return { type: "otp", message: out.message };
    case "redirect": return { type: "redirect", url: out.url };
    default: return { type: "failed", message: out.message };
  }
}

/**
 * Places the order in the database, which recomputes every price and fee itself, then starts the payment.
 * The order is only marked paid later, by the verified webhook. Nothing here trusts the browser's totals.
 */
export async function placeOrderAction(input: PlaceInput): Promise<PlaceResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Checkout is not connected yet." };
  const opts = paymentOptions();
  if (input.payMethod === "manual_momo" ? !opts.manual : !opts.paystack) {
    return { ok: false, error: "That payment option is not available right now. Please choose another, or WhatsApp us." };
  }
  if (limited("place", await clientKey(), 12, 60 * 60_000)) return { ok: false, error: "Too many orders from this connection. Please wait a little, or WhatsApp us." };

  const { data, error } = await createPublicClient().rpc("place_order", { p: placePayload(input) });
  if (error || !data) return { ok: false, error: customerMessage(error ?? { message: "" }) };
  const r = data as { number: string; total: number; due_now: number; balance_due: number; payment_reference: string };

  const next = await begin({
    method: input.payMethod,
    email: input.customer.email,
    phone: input.momoPhone || input.customer.phone,
    amount: Number(r.due_now),
    reference: r.payment_reference,
    number: r.number,
  });
  return { ok: true, number: r.number, total: Number(r.total), dueNow: Number(r.due_now), balanceDue: Number(r.balance_due), reference: r.payment_reference, next };
}

/** A failed or timed-out payment: try again, maybe with another number or method. The order and bag are kept (FR-CO-004). */
export async function retryPaymentAction(a: { number: string; phone: string; email: string; method: PayChoice; momoPhone?: string }): Promise<RetryResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Checkout is not connected yet." };
  if (limited("retry", await clientKey(), 10, 15 * 60_000)) return { ok: false, error: "Too many tries. Please wait a few minutes, or WhatsApp us." };
  const opts = paymentOptions();
  if (a.method === "manual_momo" ? !opts.manual : !opts.paystack) return { ok: false, error: "That payment option is not available right now." };

  const { data, error } = await createPublicClient().rpc("retry_payment", { p_number: a.number, p_phone: a.phone, p_method: a.method });
  if (error || !data) return { ok: false, error: customerMessage(error ?? { message: "" }) };
  const r = data as { payment_reference: string; amount: number };
  const next = await begin({ method: a.method, email: a.email, phone: a.momoPhone || a.phone, amount: Number(r.amount), reference: r.payment_reference, number: a.number });
  return { ok: true, reference: r.payment_reference, amount: Number(r.amount), next };
}

export async function submitManualPaymentAction(a: { number: string; phone: string; txn: string }): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Checkout is not connected yet." };
  if (limited("manual", await clientKey(), 10, 15 * 60_000)) return { ok: false, error: "Too many tries. Please wait a few minutes." };
  const { error } = await createPublicClient().rpc("submit_manual_payment", { p_number: a.number, p_phone: a.phone, p_txn: a.txn });
  return error ? { ok: false, error: customerMessage(error) } : { ok: true };
}

/** Looks an order up for the tracker. Needs the order number and the phone number; both must match. */
export async function trackOrderAction(a: { number: string; phone: string }): Promise<{ ok: true; track: TrackView } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Tracking is not connected yet." };
  // generous enough for a page that polls every few seconds, tight enough to make guessing numbers pointless
  if (limited("track", await clientKey(), 60, 5 * 60_000)) return { ok: false, error: "Too many lookups. Please wait a few minutes." };
  const { data, error } = await createPublicClient().rpc("track_order", { p_number: a.number, p_phone: a.phone });
  if (error) return { ok: false, error: "We could not look that up. Please try again." };
  if (!data) return { ok: false, error: "We could not find that order. Check the order number and the phone number you used at checkout." };
  return { ok: true, track: buildTrack(data as TrackJson) };
}
