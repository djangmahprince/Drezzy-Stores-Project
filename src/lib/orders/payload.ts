// The JSON the application sends to the database order functions. Pure, so the exact payloads are tested against the real SQL
// (supabase/tests/orders-contract.test.mjs): a mismatch between this file and the functions fails a test, not a customer.
import type { PlaceInput, StaffOrderInput } from "./types.ts";

/** Guest checkout (public.place_order). Prices, fees and totals are deliberately absent: the database works them out. */
export function placePayload(input: PlaceInput) {
  return {
    channel: "web",
    customer: input.customer,
    receiver: input.receiver ?? null,
    delivery: input.delivery,
    plan: input.plan,
    source: input.source,
    source_detail: input.sourceDetail,
    pay_method: input.payMethod,
    items: input.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
    ...(input.coupon ? { coupon: input.coupon } : {}),
    ...(input.consents ? { consents: input.consents } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
  };
}

/** A staff-created order (WhatsApp, phone, Instagram DM, walk-in). The discount is honoured only for staff, in the database. */
export function staffPayload(input: StaffOrderInput) {
  return {
    channel: input.channel,
    customer: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email || null },
    delivery: input.delivery,
    plan: input.plan,
    source: input.source,
    discount: input.discount,
    items: input.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
  };
}
