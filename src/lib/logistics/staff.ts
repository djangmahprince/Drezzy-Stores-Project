import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LogisticsJob = {
  id: string; number: string; status: string; customer: string; customerPhone: string; place: string; rider: string | null; riderPhone: string | null; courier: string | null;
  tracking: string | null; balance: number; update: string | null; updateAt: string | null; due: string | null;
};
export type LogisticsRider = { id: string; name: string; kind: string; company: string | null; phone: string | null; region: string | null; active: number; deliveredWeek: number; hasLogin: boolean };
export type LogisticsLine = { accra: string; kumasi: string; hours: string };
export type LogisticsData = { jobs: LogisticsJob[]; riders: LogisticsRider[]; line: LogisticsLine; deliveredToday: number };

type J = { id: string; number: string; status: string; region: string | null; city: string | null; area: string | null; rider_id: string | null; rider_name: string | null; rider_phone: string | null; courier: string | null; tracking_number: string | null; balance_due: number | string; delivery_update: string | null; delivery_update_at: string | null; est_delivery_date: string | null; receiver_name: string | null; receiver_phone: string | null; customer: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null };

/** The logistics desk: what is on the road, who has it, and how to reach them. Row-level security applies. */
export async function getLogistics(): Promise<LogisticsData> {
  await requireStaff();
  await connection(); // "today" and "this week" depend on the request time
  const db = await createClient();
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const monday = new Date(now - ((new Date(now).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  const [open, riders, done, site] = await Promise.all([
    db.from("orders").select("id, number, status, region, city, area, rider_id, rider_name, rider_phone, courier, tracking_number, balance_due, delivery_update, delivery_update_at, est_delivery_date, receiver_name, receiver_phone, customer:customers(full_name, phone)").in("status", ["packed", "dispatched", "out_for_delivery", "failed_delivery"]).eq("delivery_method", "home").order("est_delivery_date", { nullsFirst: false }).limit(300),
    db.from("riders").select("id, name, kind, company, phone, region, user_id").eq("active", true).order("name"),
    db.from("orders").select("rider_id, delivered_at").eq("status", "delivered").gte("delivered_at", monday).limit(5000),
    db.from("site_settings").select("data").maybeSingle(),
  ]);
  const rows = (open.data ?? []) as unknown as J[];
  const delivered = (done.data ?? []) as { rider_id: string | null; delivered_at: string }[];
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const data = (site.data?.data ?? {}) as { logistics?: Partial<LogisticsLine>; hours?: string; accra?: { call?: string }; kumasi?: { call?: string } };
  return {
    jobs: rows.map((o) => ({
      id: o.id, number: o.number, status: o.status, customer: o.receiver_name ?? one(o.customer)?.full_name ?? "Customer", customerPhone: o.receiver_phone ?? one(o.customer)?.phone ?? "",
      place: [o.area, o.city, o.region].filter(Boolean).join(", "), rider: o.rider_name, riderPhone: o.rider_phone, courier: o.courier, tracking: o.tracking_number, balance: Number(o.balance_due),
      update: o.delivery_update, updateAt: o.delivery_update_at, due: o.est_delivery_date,
    })),
    riders: ((riders.data ?? []) as { id: string; name: string; kind: string; company: string | null; phone: string | null; region: string | null; user_id: string | null }[]).map((r) => ({
      id: r.id, name: r.name, kind: r.kind, company: r.company, phone: r.phone, region: r.region, hasLogin: !!r.user_id,
      active: rows.filter((o) => o.rider_id === r.id && o.status !== "packed").length, deliveredWeek: delivered.filter((d) => d.rider_id === r.id).length,
    })),
    line: { accra: data.logistics?.accra || data.accra?.call || "", kumasi: data.logistics?.kumasi || data.kumasi?.call || "", hours: data.logistics?.hours || data.hours || "" },
    deliveredToday: delivered.filter((d) => d.delivered_at.slice(0, 10) === day).length,
  };
}
