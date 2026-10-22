// What payment options are switched on. Read on the server only; the checkout page is told the result, never the keys.

export const paystackSecret = () => process.env.PAYSTACK_SECRET_KEY || "";

export const manualMomo = () => {
  const number = process.env.DREZZY_MOMO_NUMBER || "";
  const name = process.env.DREZZY_MOMO_NAME || "";
  return number ? { number, name } : null;
};

export type PaymentOptions = {
  /** MTN, Telecel, AirtelTigo prompts and cards, through Paystack. */
  paystack: boolean;
  /** The fallback while Paystack is not approved yet: pay to the MoMo number, then enter the transaction ID (FR-CO-006). */
  manual: { number: string; name: string } | null;
};

export const paymentOptions = (): PaymentOptions => ({ paystack: Boolean(paystackSecret()), manual: manualMomo() });
