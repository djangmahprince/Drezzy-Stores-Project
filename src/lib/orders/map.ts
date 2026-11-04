// Turns database order rows into what the dashboard shows. Pure, so it is tested without a database.
import { statusFromDb, type DashOrder, type Status } from "./dash-types.ts";

export type OrderRow = {
  id: string; number: string; channel: string; branch: string; status: string; payment_state: string; payment_plan: string;
  total: number | string; balance_due: number | string; amount_paid: number | string;
  delivery_method: string; region: string | null; city: string | null; area: string | null;
  agent_name: string | null; courier: string | null; created_at: string; updated_at: string;
  source?: string | null; rider_name?: string | null;
  customer: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
  items: { product_name: string; variant_label: string; qty: number }[] | null;
  supplier_orders?: { status: string; supplier: { name: string } | { name: string }[] | null }[] | null;
};

const channelLabel: Record<string, DashOrder["channel"]> = {
  web: "Web", whatsapp: "WhatsApp", phone: "Phone", instagram_dm: "Instagram DM", walk_in: "Walk-in",
};

const ghs = (n: number) => `GHS ${n.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

/** "12 min", "5 h", "3 d". The caller passes `now`, so the result is the same on the server and in tests. */
export function ageLabel(now: number, then: string): string {
  const mins = Math.max(0, Math.round((now - new Date(then).getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/** Alert limits from PRD FR-ORD: not confirmed after 2 hours, supplier order not placed after 24 hours, not moved on after 24 hours. */
export function isLate(status: Status, hoursInStage: number): boolean {
  switch (status) {
    case "to_confirm": return hoursInStage >= 2;
    case "to_source": return hoursInStage >= 24;
    case "ready_to_pack": case "packed": return hoursInStage >= 24;
    case "awaiting_payment": return hoursInStage >= 24;
    default: return false;
  }
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export function orderFromRow(r: OrderRow, now: number): DashOrder {
  const status = statusFromDb(r.status);
  const customer = one(r.customer);
  const total = Number(r.total);
  const balance = Number(r.balance_due);
  const paid = Number(r.amount_paid);
  const hours = (now - new Date(r.updated_at).getTime()) / 3_600_000;

  const pay: DashOrder["pay"] =
    r.payment_state === "pending_check" ? "pending" : r.payment_state === "part_paid" ? "half" : r.payment_state === "paid" ? "paid" : "unpaid";
  const payNote =
    pay === "pending" ? "Manual MoMo · pending check"
    : pay === "half" ? `Half paid · ${ghs(paid)} received`
    : pay === "paid" ? "Paid in full"
    : `Awaiting payment · ${ghs(r.payment_plan === "half" ? Math.ceil((total * 100) / 2) / 100 : total)}`;

  return {
    id: r.number,
    dbId: r.id,
    customer: (customer?.full_name ?? "Customer").split(" ")[0],
    phone: customer?.phone,
    place: r.delivery_method === "pickup" ? "Accra branch pickup" : [r.area, r.city].filter(Boolean).join(", ") || r.region || "",
    branch: r.branch === "kumasi" ? "Kumasi" : "Accra",
    items: (r.items ?? []).map((i) => `${i.product_name}${i.variant_label ? ` · ${i.variant_label}` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", "),
    channel: channelLabel[r.channel] ?? "Web",
    pay,
    payNote,
    total,
    balance,
    agent: r.agent_name ?? (r.channel === "web" ? "Website" : "—"),
    status,
    age: ageLabel(now, r.updated_at),
    late: isLate(status, hours),
    courier: r.courier ?? undefined,
    supplier: one(r.supplier_orders?.find((s) => s.status !== "failed")?.supplier)?.name,
    log: [],
    notes: [],
    ...(r.region ? { region: r.region } : {}),
    ...(r.source ? { source: r.source } : {}),
    createdAt: r.created_at,
    ...(r.rider_name ? { rider: r.rider_name } : {}),
  };
}
