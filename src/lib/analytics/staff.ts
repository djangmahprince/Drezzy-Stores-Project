import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Analytics = {
  from: string;
  to: string;
  days: number;
  ordersPlaced: number;
  paidOrders: number;
  delivered: number;
  cancelled: number;
  /** null when the role's analytics access is limited to a non-money area. */
  grossSales: number | null;
  averageOrder: number | null;
  newCustomers: number;
  repeatCustomers: number;
  funnel: { step: string; count: number }[];
  channels: { channel: string; orders: number }[];
  sources: { source: string; orders: number }[];
  topProducts: { name: string; units: number; revenue: number | null }[];
};

type Json = {
  orders_placed: number; paid_orders: number; delivered: number; cancelled: number; gross_sales: number | string | null; average_order: number | string | null;
  new_customers: number; repeat_customers: number; funnel: { step: string; count: number }[]; channels: { channel: string; orders: number }[];
  sources: { source: string; orders: number }[]; top_products: { name: string; units: number; revenue: number | string | null }[];
};

export const ranges = [1, 7, 30, 90] as const;

/** The last `days` days, ending today (UTC, which is Accra time). */
export async function getAnalytics(days: number): Promise<Analytics | null> {
  await requireStaff();
  await connection();
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const f = from.toISOString().slice(0, 10);
  const t = to.toISOString().slice(0, 10);
  const { data, error } = await (await createClient()).rpc("analytics_summary", { p_from: f, p_to: t });
  if (error || !data) return null;
  const j = data as Json;
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    from: f, to: t, days, ordersPlaced: j.orders_placed, paidOrders: j.paid_orders, delivered: j.delivered, cancelled: j.cancelled,
    grossSales: n(j.gross_sales), averageOrder: n(j.average_order), newCustomers: j.new_customers, repeatCustomers: j.repeat_customers,
    funnel: j.funnel, channels: j.channels, sources: j.sources, topProducts: j.top_products.map((p) => ({ name: p.name, units: p.units, revenue: n(p.revenue) })),
  };
}
