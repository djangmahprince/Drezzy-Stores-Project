import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type Attention = { tone: "bad" | "warn"; tag: string; text: string; href: string };
export type HomeData = {
  greeting: string;
  name: string;
  /** Orders by stage, for the orders this person may see. */
  stages: { label: string; count: number }[];
  attention: Attention[];
  /** Paid in per day for the last 7 days (oldest first). Null when the role cannot see payments. */
  days: { label: string; amount: number }[] | null;
  weekTotal: number;
  sources: { source: string; count: number }[];
  weekOrders: number;
  canOrders: boolean;
};

const HOUR = 3_600_000;
const stageLabels: [string, string][] = [
  ["awaiting_payment", "Awaiting payment or check"], ["to_confirm", "To confirm"], ["to_source", "Getting from supplier"], ["ready_to_pack", "Received, ready to pack"],
  ["packed", "Packed"], ["dispatched", "Dispatched"], ["out_for_delivery", "Out for delivery"], ["failed_delivery", "Failed delivery"],
];

/** The home screen: counts and warnings drawn from the same records (and the same access rules) as every other page. */
export async function getHome(): Promise<HomeData> {
  const me = await requireStaff();
  await connection(); // everything below depends on the current time
  const supabase = await createClient();
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * HOUR).toISOString();
  const canOrders = can(me.permissions, "orders", "view");

  const [open, recent, pays, refunds] = await Promise.all([
    canOrders ? supabase.from("orders").select("number, status, payment_state, updated_at, agent_name").not("status", "in", "(delivered,cancelled)").limit(1000) : Promise.resolve({ data: [] }),
    canOrders ? supabase.from("orders").select("source").gte("created_at", weekAgo).limit(2000) : Promise.resolve({ data: [] }),
    canOrders ? supabase.from("payments").select("amount, confirmed_at").eq("status", "success").neq("kind", "refund").gte("confirmed_at", weekAgo) : Promise.resolve({ data: null }),
    can(me.permissions, "refunds", "view") ? supabase.from("refunds").select("id", { count: "exact", head: true }).eq("status", "requested") : Promise.resolve({ count: 0 }),
  ]);

  type O = { number: string; status: string; payment_state: string; updated_at: string; agent_name: string | null };
  const orders = (open.data ?? []) as O[];
  const counts = new Map<string, number>();
  for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);

  const attention: Attention[] = [];
  const age = (o: O) => (now - Date.parse(o.updated_at)) / HOUR;
  for (const o of orders.filter((x) => x.payment_state === "pending_check").slice(0, 5)) attention.push({ tone: "warn", tag: "Payment", text: `Check the MoMo payment for ${o.number}`, href: `/dashboard/orders/${o.number}` });
  for (const o of orders.filter((x) => x.status === "to_confirm" && age(x) > 2).slice(0, 5)) attention.push({ tone: "bad", tag: "Stuck", text: `${o.number} has waited ${Math.floor(age(o))} h to be confirmed${o.agent_name ? ` · ${o.agent_name}` : ""}`, href: `/dashboard/orders/${o.number}` });
  for (const o of orders.filter((x) => x.status === "to_source" && age(x) > 72).slice(0, 5)) attention.push({ tone: "bad", tag: "Supplier late", text: `${o.number} has been with suppliers for ${Math.floor(age(o) / 24)} days`, href: `/dashboard/orders/${o.number}` });
  for (const o of orders.filter((x) => x.status === "failed_delivery").slice(0, 5)) attention.push({ tone: "bad", tag: "Delivery", text: `${o.number} failed delivery and needs rescheduling`, href: `/dashboard/orders/${o.number}` });
  const askedRefunds = (refunds as { count?: number | null }).count ?? 0;
  if (askedRefunds > 0) attention.push({ tone: "warn", tag: "Refunds", text: `${askedRefunds} refund ${askedRefunds === 1 ? "request is" : "requests are"} waiting for a decision`, href: "/dashboard/orders" });

  // seven day columns ending today, labelled by weekday in Accra time
  const label = (t: number) => new Intl.DateTimeFormat("en-GH", { weekday: "short", timeZone: "Africa/Accra" }).format(new Date(t));
  const key = (t: number) => new Date(t).toISOString().slice(0, 10);
  const dayList = Array.from({ length: 7 }, (_, i) => now - (6 - i) * 24 * HOUR);
  const sums = new Map<string, number>();
  for (const p of (pays.data ?? []) as { amount: number | string; confirmed_at: string }[]) sums.set(p.confirmed_at.slice(0, 10), (sums.get(p.confirmed_at.slice(0, 10)) ?? 0) + Number(p.amount));
  const days = pays.data === null ? null : dayList.map((t) => ({ label: label(t), amount: sums.get(key(t)) ?? 0 }));

  const bySource = new Map<string, number>();
  for (const r of (recent.data ?? []) as { source: string | null }[]) bySource.set(r.source ?? "Not given", (bySource.get(r.source ?? "Not given") ?? 0) + 1);

  const hour = Number(new Intl.DateTimeFormat("en-GH", { hour: "numeric", hour12: false, timeZone: "Africa/Accra" }).format(now));
  return {
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    name: me.fullName.split(" ")[0] ?? "",
    stages: stageLabels.map(([k, l]) => ({ label: l, count: counts.get(k) ?? 0 })),
    attention,
    days,
    weekTotal: (days ?? []).reduce((s, d) => s + d.amount, 0),
    sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    weekOrders: (recent.data ?? []).length,
    canOrders,
  };
}
