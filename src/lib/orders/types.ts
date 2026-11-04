// Shapes shared by the checkout actions and the checkout screen. No imports, so client code can use them freely.

export type PayChoice = "mtn" | "telecel" | "airtel" | "card" | "manual_momo";

export type PlaceInput = {
  customer: { name: string; phone: string; email: string };
  receiver?: { name: string; phone: string } | null;
  delivery: { method: "home" | "pickup"; region: string; city: string; area: string; street: string; gps: string; note: string; landmark?: string; lat?: number; lng?: number };
  plan: "full" | "half";
  source: string;
  sourceDetail: string;
  items: { variantId: string; qty: number }[];
  payMethod: PayChoice;
  coupon?: string;
  /** What the shopper agreed to at checkout: order updates by WhatsApp or SMS, marketing, saving the MoMo number. */
  consents?: { whatsapp?: boolean; sms?: boolean; marketing?: boolean; save_momo?: boolean; momo_number?: string };
  /** Where the visit came from (UTM tags, referrer, Drip School article) for the source report. */
  attribution?: { utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string; session?: string; article?: string; device?: string };
  /** The number to send the MoMo prompt to, when it is not the contact phone. */
  momoPhone?: string;
};

/** What the screen should do next after an order is placed and a payment has been started. */
export type NextStep =
  | { type: "prompt" } // MoMo prompt sent: wait for the customer to approve it
  | { type: "otp"; message: string }
  | { type: "redirect"; url: string } // card: go to the hosted page
  | { type: "manual"; number: string; name: string }
  | { type: "failed"; message: string }; // the order exists, the payment did not start: offer retry

export type PlaceResult =
  | { ok: true; number: string; dueNow: number; balanceDue: number; total: number; reference: string; next: NextStep }
  | { ok: false; error: string };

export type RetryResult = { ok: true; reference: string; amount: number; next: NextStep } | { ok: false; error: string };

export type StaffOrderInput = {
  channel: "whatsapp" | "phone" | "instagram_dm" | "walk_in";
  customer: { name: string; phone: string; email: string };
  delivery: { method: "home" | "pickup"; region: string; city: string; area: string; street: string };
  plan: "full" | "half";
  source: string;
  discount: { amount: number; reason: string };
  items: { variantId: string; qty: number }[];
};
