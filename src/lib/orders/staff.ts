import "server-only";
import { requireStaff } from "@/lib/auth";
import type { DashOrder } from "@/lib/orders/dash-types";
import { orderFromRow, type OrderRow } from "@/lib/orders/map";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type OrderRights = {
  /** Move orders along, add notes, record payments and balances. */
  canEdit: boolean;
  canCreate: boolean;
  /** Admin override: move an order back, with a reason. */
  canOverride: boolean;
  /** Match a manual MoMo payment to the statement (Finance, Admin, Owner). */
  canReviewPayments: boolean;
};

const rightsOf = (perms: Parameters<typeof can>[0]): OrderRights => ({
  canEdit: can(perms, "orders", "edit"),
  canCreate: can(perms, "orders", "create"),
  canOverride: can(perms, "orders", "delete"),
  canReviewPayments: can(perms, "expenses", "edit") || can(perms, "orders", "delete"),
});

const LIST_SELECT =
  "id, number, channel, branch, status, payment_state, payment_plan, total, balance_due, amount_paid, delivery_method, region, city, area, agent_name, courier, created_at, updated_at, " +
  "customer:customers(full_name, phone), items:order_items(product_name, variant_label, qty)";

/** The orders this person may see. Row-level security already limits "own records only" roles to their own. */
export async function getStaffOrders(): Promise<{ mode: "db" | "demo"; orders: DashOrder[]; rights: OrderRights }> {
  const me = await requireStaff();
  const rights = rightsOf(me.permissions);
  if (!isSupabaseConfigured) return { mode: "demo", orders: [], rights };

  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(LIST_SELECT).order("created_at", { ascending: false }).limit(500);
  const now = Date.now();
  return { mode: "db", orders: ((data ?? []) as unknown as OrderRow[]).map((r) => orderFromRow(r, now)), rights };
}

// ---------------------------------------------------------------------------
// One order in full
// ---------------------------------------------------------------------------
export type OrderDetail = {
  id: string;
  number: string;
  status: string;
  paymentState: string;
  plan: "full" | "half";
  channel: string;
  branch: string;
  customer: { name: string; phone: string; email: string | null };
  receiver: { name: string | null; phone: string | null };
  address: string[];
  method: "home" | "pickup";
  riderNote: string | null;
  source: string | null;
  agent: string | null;
  courier: string | null;
  tracking: string | null;
  rider: { name: string | null; phone: string | null };
  estDelivery: string | null;
  money: { subtotal: number; fee: number; discount: number; discountReason: string | null; total: number; paid: number; balance: number };
  items: { name: string; label: string; qty: number; unit: number }[];
  events: { kind: string; status: string | null; at: string; actor: string | null; publicNote: string | null; internalNote: string | null }[];
  payments: { id: string; kind: string; provider: string; method: string | null; reference: string; txn: string | null; amount: number; status: string; at: string }[];
  notes: { author: string | null; body: string; at: string }[];
  rights: OrderRights;
};

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).format(new Date(iso));

type DetailRow = {
  id: string; number: string; status: string; payment_state: string; payment_plan: "full" | "half"; channel: string; branch: string;
  subtotal: number | string; delivery_fee: number | string; discount: number | string; discount_reason: string | null; total: number | string;
  amount_paid: number | string; balance_due: number | string; delivery_method: "home" | "pickup"; receiver_name: string | null; receiver_phone: string | null;
  region: string | null; city: string | null; area: string | null; street: string | null; gps_code: string | null; rider_note: string | null;
  source: string | null; source_detail: string | null; agent_name: string | null; courier: string | null; tracking_number: string | null;
  rider_name: string | null; rider_phone: string | null; est_delivery_date: string | null;
  customer: { full_name: string; phone: string; email: string | null } | { full_name: string; phone: string; email: string | null }[] | null;
  items: { product_name: string; variant_label: string; qty: number; unit_price: number | string }[] | null;
  events: { kind: string; status: string | null; at: string; actor_name: string | null; public_note: string | null; internal_note: string | null; id: number }[] | null;
  payments: { id: string; kind: string; provider: string; method: string | null; reference: string; external_ref: string | null; amount: number | string; status: string; created_at: string }[] | null;
  notes: { author_name: string | null; body: string; at: string; id: number }[] | null;
};

export async function getOrderDetail(number: string): Promise<OrderDetail | null> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, customer:customers(full_name, phone, email), items:order_items(*), events:order_events(*), payments(*), notes:order_notes(*)")
    .eq("number", number.toUpperCase())
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as DetailRow;
  const c = Array.isArray(r.customer) ? r.customer[0] : r.customer;
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    paymentState: r.payment_state,
    plan: r.payment_plan,
    channel: r.channel,
    branch: r.branch,
    customer: { name: c?.full_name ?? "Customer", phone: c?.phone ?? "", email: c?.email ?? null },
    receiver: { name: r.receiver_name, phone: r.receiver_phone },
    address: r.delivery_method === "pickup" ? ["Pick up at the Accra branch"] : [r.street, r.area, r.city, r.region, r.gps_code ? `GPS ${r.gps_code}` : null].filter((x): x is string => !!x),
    method: r.delivery_method,
    riderNote: r.rider_note,
    source: [r.source, r.source_detail].filter(Boolean).join(" · ") || null,
    agent: r.agent_name,
    courier: r.courier,
    tracking: r.tracking_number,
    rider: { name: r.rider_name, phone: r.rider_phone },
    estDelivery: r.est_delivery_date,
    money: {
      subtotal: Number(r.subtotal), fee: Number(r.delivery_fee), discount: Number(r.discount), discountReason: r.discount_reason,
      total: Number(r.total), paid: Number(r.amount_paid), balance: Number(r.balance_due),
    },
    items: (r.items ?? []).map((i) => ({ name: i.product_name, label: i.variant_label, qty: i.qty, unit: Number(i.unit_price) })),
    events: [...(r.events ?? [])].sort((a, b) => b.id - a.id).map((e) => ({ kind: e.kind, status: e.status, at: stamp(e.at), actor: e.actor_name, publicNote: e.public_note, internalNote: e.internal_note })),
    payments: [...(r.payments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => ({
      id: p.id, kind: p.kind, provider: p.provider, method: p.method, reference: p.reference, txn: p.external_ref, amount: Number(p.amount), status: p.status, at: stamp(p.created_at),
    })),
    notes: [...(r.notes ?? [])].sort((a, b) => b.id - a.id).map((n) => ({ author: n.author_name, body: n.body, at: stamp(n.at) })),
    rights: rightsOf(me.permissions),
  };
}
