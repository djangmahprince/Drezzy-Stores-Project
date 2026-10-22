// Paystack logic that needs no network: request bodies, webhook signature checking and webhook parsing.
// Kept pure so it is unit-tested (supabase/tests/payments.test.mjs). The HTTP calls live in paystack.ts.
//
// Amounts: Paystack works in the smallest unit, so GHS 450.00 is 45000 pesewas. We store cedis, so convert at the edge.
import { createHmac, timingSafeEqual } from "node:crypto";

export type MomoNetwork = "mtn" | "telecel" | "airtel";
export type PayMethod = MomoNetwork | "card" | "manual_momo";

/** Paystack's code for each Ghana mobile money network. */
export const PROVIDER_CODE: Record<MomoNetwork, string> = { mtn: "mtn", telecel: "vod", airtel: "atl" };

export const toPesewas = (cedis: number) => Math.round(cedis * 100);
export const fromPesewas = (pesewas: number) => pesewas / 100;

/** Local number (024...) in the form Paystack expects for mobile money. International forms are turned into local ones. */
export function localPhone(p: string): string {
  const d = p.replace(/[\s().-]/g, "");
  if (/^\+233\d{9}$/.test(d)) return "0" + d.slice(4);
  if (/^233\d{9}$/.test(d)) return "0" + d.slice(3);
  return d;
}

export function chargeBody(a: { email: string; amount: number; reference: string; phone: string; network: MomoNetwork }) {
  return {
    email: a.email,
    amount: toPesewas(a.amount),
    currency: "GHS",
    reference: a.reference,
    mobile_money: { phone: localPhone(a.phone), provider: PROVIDER_CODE[a.network] },
  };
}

export function initializeBody(a: { email: string; amount: number; reference: string; callbackUrl: string }) {
  return {
    email: a.email,
    amount: toPesewas(a.amount),
    currency: "GHS",
    reference: a.reference,
    callback_url: a.callbackUrl,
    channels: ["card"],
  };
}

/**
 * Paystack signs each webhook with HMAC-SHA512 of the raw request body, using the secret key, in the
 * x-paystack-signature header. Compare in constant time. Never parse the body before this passes.
 */
export function verifySignature(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WebhookResult =
  | { kind: "success"; reference: string; amount: number; currency: string }
  | { kind: "ignored"; reason: string };

/** Reads a verified webhook body. Only a successful charge in cedis counts; everything else is ignored, not trusted. */
export function parseWebhook(rawBody: string): WebhookResult {
  let body: { event?: string; data?: { reference?: string; amount?: number; currency?: string; status?: string } } | null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { kind: "ignored", reason: "not json" };
  }
  if (!body || typeof body !== "object") return { kind: "ignored", reason: "not an object" };
  if (body.event !== "charge.success") return { kind: "ignored", reason: `event ${body.event ?? "missing"}` };
  const d = body.data;
  if (!d || typeof d.reference !== "string" || typeof d.amount !== "number") return { kind: "ignored", reason: "incomplete data" };
  if (d.status !== "success") return { kind: "ignored", reason: `status ${d.status ?? "missing"}` };
  if (d.currency !== "GHS") return { kind: "ignored", reason: `currency ${d.currency ?? "missing"}` };
  return { kind: "success", reference: d.reference, amount: fromPesewas(d.amount), currency: d.currency };
}

/** What the customer's screen should do after we ask Paystack to start a payment. */
export type ChargeOutcome =
  | { next: "prompt" } // a MoMo prompt was sent to their phone
  | { next: "otp"; message: string } // the network wants a code first (Telecel and AirtelTigo can)
  | { next: "redirect"; url: string } // card: go to Paystack's hosted page
  | { next: "failed"; message: string };

export function chargeOutcome(res: { status?: boolean; message?: string; data?: { status?: string; display_text?: string } }): ChargeOutcome {
  if (res.status === false) return { next: "failed", message: res.message || "The payment could not be started." };
  const s = res.data?.status;
  if (s === "pay_offline" || s === "pending" || s === "success") return { next: "prompt" };
  if (s === "send_otp" || s === "send_pin") return { next: "otp", message: res.data?.display_text || "Enter the code sent to your phone." };
  return { next: "failed", message: res.data?.display_text || res.message || "The payment could not be started." };
}
