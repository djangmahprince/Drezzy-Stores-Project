import "server-only";
import { chargeBody, chargeOutcome, initializeBody, type ChargeOutcome, type MomoNetwork } from "@/lib/payments/paystack-core";
import { paystackSecret } from "@/lib/payments/config";

const API = "https://api.paystack.co";

async function call(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackSecret()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: Record<string, unknown> & { status?: string; display_text?: string; authorization_url?: string } };
}

/**
 * Starts a payment. MoMo sends a prompt to the customer's phone; a card sends them to Paystack's hosted page, so
 * Drezzy never sees a card number or a PIN. The order is NOT marked paid here: only the verified webhook does that.
 */
export async function startPayment(a: {
  method: MomoNetwork | "card";
  email: string;
  phone: string;
  amount: number;
  reference: string;
  callbackUrl: string;
}): Promise<ChargeOutcome> {
  try {
    if (a.method === "card") {
      const r = await call("/transaction/initialize", initializeBody({ email: a.email, amount: a.amount, reference: a.reference, callbackUrl: a.callbackUrl }));
      const url = r.data?.authorization_url;
      return r.status && typeof url === "string" ? { next: "redirect", url } : { next: "failed", message: r.message || "The card payment could not be started." };
    }
    const r = await call("/charge", chargeBody({ email: a.email, amount: a.amount, reference: a.reference, phone: a.phone, network: a.method }));
    return chargeOutcome(r);
  } catch {
    return { next: "failed", message: "We could not reach the payment provider. Please try again." };
  }
}
