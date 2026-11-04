import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDoc } from "@/lib/pdf/docs";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const n = (v: unknown) => Number(v ?? 0);

/** An order for a staff document, read with the staff member's own session (row-level security applies). */
export async function staffOrderDoc(supabase: SupabaseClient, id: string): Promise<OrderDoc | null> {
  const { data } = await supabase
    .from("orders")
    .select("number, created_at, status, payment_plan, subtotal, delivery_fee, discount, total, amount_paid, balance_due, delivery_method, receiver_name, receiver_phone, region, city, area, street, landmark, gps_code, rider_note, rider_name, courier, tracking_number, branch, customer:customers(full_name, phone, email), items:order_items(product_name, variant_label, qty, unit_price), payments(kind, method, provider, amount, status, confirmed_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const c = one(d.customer as { full_name: string; phone: string | null; email: string | null } | null);
  return {
    number: d.number as string,
    placedAt: d.created_at as string,
    status: d.status as string,
    plan: d.payment_plan as "full" | "half",
    customer: { name: c?.full_name ?? "Customer", phone: c?.phone ?? null, email: c?.email ?? null },
    receiver: { name: (d.receiver_name as string) ?? null, phone: (d.receiver_phone as string) ?? null },
    delivery: { method: d.delivery_method as string, region: d.region as string, city: d.city as string, area: d.area as string, street: d.street as string, landmark: d.landmark as string, gps: d.gps_code as string, note: d.rider_note as string },
    items: ((d.items as { product_name: string; variant_label: string; qty: number; unit_price: number }[]) ?? []).map((i) => ({ name: i.product_name, detail: i.variant_label, qty: i.qty, price: n(i.unit_price) })),
    subtotal: n(d.subtotal), fee: n(d.delivery_fee), discount: n(d.discount), total: n(d.total), paid: n(d.amount_paid), balance: n(d.balance_due),
    payments: ((d.payments as { kind: string; method: string | null; provider: string; amount: number; status: string; confirmed_at: string | null }[]) ?? [])
      .filter((p) => p.status === "success").map((p) => ({ kind: p.kind, method: p.method ?? p.provider, amount: n(p.amount), at: p.confirmed_at })),
    rider: (d.rider_name as string) ?? null, courier: (d.courier as string) ?? null, tracking: (d.tracking_number as string) ?? null, branch: d.branch as string,
  };
}

type Tracked = {
  number: string; placed_at: string; status: string; plan: "full" | "half"; subtotal?: number; delivery_fee?: number; discount?: number;
  total: number; amount_paid: number; balance_due: number; delivery_method: string; region: string | null; city: string | null; area: string | null;
  receiver_name: string; branch: string; items: { name: string; detail: string; qty: number; price?: number }[];
  payments: { kind: string; method: string | null; amount: number; at: string | null }[];
};

/** A customer's invoice, from the public tracker (which already checked the order number and phone). */
export function trackedOrderDoc(t: Tracked, phone: string): OrderDoc {
  return {
    number: t.number, placedAt: t.placed_at, status: t.status, plan: t.plan,
    customer: { name: t.receiver_name, phone, email: null },
    delivery: { method: t.delivery_method, region: t.region, city: t.city, area: t.area, street: null, landmark: null, gps: null, note: null },
    items: t.items.map((i) => ({ name: i.name, detail: i.detail, qty: i.qty, price: n(i.price) })),
    subtotal: n(t.subtotal), fee: n(t.delivery_fee), discount: n(t.discount), total: n(t.total), paid: n(t.amount_paid), balance: n(t.balance_due),
    payments: t.payments.map((p) => ({ ...p, amount: n(p.amount) })), branch: t.branch,
  };
}
