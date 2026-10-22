import { paystackSecret } from "@/lib/payments/config";
import { parseWebhook, verifySignature } from "@/lib/payments/paystack-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Paystack tells us a payment succeeded. We trust nothing until the signature on the RAW body checks out, and even then
 * the database re-checks the amount against the order and ignores repeats (FR-CO-003). The browser redirect never marks an
 * order paid; only this endpoint does.
 */
export async function POST(request: Request) {
  const secret = paystackSecret();
  if (!secret || !isSupabaseConfigured) return new Response("Payments are not configured", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-paystack-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = parseWebhook(raw);
  if (event.kind === "ignored") return Response.json({ ok: true, ignored: event.reason });

  const { data, error } = await createAdminClient().rpc("confirm_payment", {
    p_reference: event.reference,
    p_amount: event.amount,
    p_raw: JSON.parse(raw),
  });
  // A server error makes Paystack retry later. A refused payment (unknown reference, wrong amount) is not retried.
  if (error) return new Response("Could not record the payment", { status: 500 });

  if (data && (data as { ok?: boolean; reason?: string }).ok === false) {
    console.warn("Payment not applied", { reference: event.reference, reason: (data as { reason?: string }).reason });
  }
  return Response.json({ ok: true });
}
