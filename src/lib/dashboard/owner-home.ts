import "server-only";
import { connection } from "next/server";
import type { HomeKpi, OwnerView, Period } from "@/lib/dashboard/owner-types";
import type { Staff } from "@/lib/auth";
import { paceOf, formatMetric, metricLabels } from "@/lib/team/pace";
import { createClient } from "@/lib/supabase/server";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GH")}`;

type Report = { current: Record<string, number | null>; previous: Record<string, number | null>; series: { day: string; orders: number; sales: number | null }[] };

/** "▲ 12% vs last week", or nothing when there is no earlier period to compare with. */
function versus(now: number, before: number | null | undefined, word: string): Pick<HomeKpi, "note" | "noteTone"> {
  if (!before) return { note: `Nothing to compare with ${word}` };
  const pct = Math.round(((now - before) / before) * 100);
  return { note: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs ${word}`, noteTone: pct >= 0 ? "ok" : "bad" };
}

/** The first screen for the Owner and Admins (PRD section 12), from the same reports and rules as Analytics. */
export async function getOwnerView(me: Staff): Promise<OwnerView> {
  await connection(); // everything here depends on the current time
  const db = await createClient();
  const now = Date.now();
  const date = iso(now);
  const dow = (new Date(now).getUTCDay() + 6) % 7;
  const weekStart = iso(now - dow * DAY);
  const monthStart = `${date.slice(0, 7)}-01`;
  const span = { today: date, week: weekStart, month: monthStart } as const;

  const [today, week, month, open, delivered, late, recent, pays, tp, refunds, stale] = await Promise.all([
    db.rpc("kpi_report", { p_from: span.today, p_to: date }),
    db.rpc("kpi_report", { p_from: span.week, p_to: date }),
    db.rpc("kpi_report", { p_from: span.month, p_to: date }),
    db.from("orders").select("number, status, payment_state, balance_due, plan:payment_plan, updated_at, agent_name").not("status", "in", "(delivered,cancelled)").limit(2000),
    db.from("orders").select("delivered_at, est_delivery_date").eq("status", "delivered").gte("delivered_at", monthStart < weekStart ? monthStart : weekStart).limit(5000),
    db.from("supplier_orders").select("id, expected_at, order:orders(number)").eq("status", "ordered").lt("expected_at", date).limit(50),
    db.from("orders").select("source").gte("created_at", weekStart).limit(2000),
    db.from("payments").select("amount, confirmed_at").eq("status", "success").neq("kind", "refund").gte("confirmed_at", weekStart),
    db.rpc("target_progress", { p_date: date }),
    db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "requested"),
    db.rpc("catalogue_report", { p_stale_days: 7 }),
  ]);

  const rows = (open.data ?? []) as { number: string; status: string; payment_state: string; balance_due: number | string; plan: string; updated_at: string; agent_name: string | null }[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const owing = rows.filter((r) => Number(r.balance_due) > 0);
  const owed = owing.reduce((s, r) => s + Number(r.balance_due), 0);
  const hours = (r: { updated_at: string }) => (now - Date.parse(r.updated_at)) / 3_600_000;
  const slow = rows.filter((r) => r.status === "to_confirm" && hours(r) > 2);
  const lateRows = (late.data ?? []) as unknown as { id: string; expected_at: string; order: { number: string } | { number: string }[] | null }[];

  const done = (delivered.data ?? []) as { delivered_at: string; est_delivery_date: string | null }[];
  const onTime = (from: string) => {
    const set = done.filter((d) => d.delivered_at.slice(0, 10) >= from);
    const hit = set.filter((d) => !d.est_delivery_date || d.delivered_at.slice(0, 10) <= d.est_delivery_date).length;
    return { n: set.length, hit, pct: set.length ? Math.round((hit / set.length) * 100) : null };
  };

  const cards = (r: { data: unknown }, p: Period): HomeKpi[] => {
    const k = r.data as Report | null;
    const word = p === "today" ? "yesterday" : p === "week" ? "last week" : "last month";
    const series = (k?.series ?? []).slice(-14);
    const t = onTime(span[p]);
    return [
      { label: "Net sales", value: ghs(Number(k?.current.net_sales ?? 0)), ...versus(Number(k?.current.net_sales ?? 0), k?.previous.net_sales, word), trend: series.map((s) => ({ x: s.day, y: Number(s.sales ?? 0) })), href: "/dashboard/analytics" },
      { label: "Paid orders", value: String(k?.current.orders ?? 0), ...versus(Number(k?.current.orders ?? 0), k?.previous.orders, word), trend: series.map((s) => ({ x: s.day, y: s.orders })), href: "/dashboard/orders" },
      { label: "Balances to collect", value: ghs(owed), note: `${owing.length} half-paid ${owing.length === 1 ? "order" : "orders"}`, href: "/dashboard/money" },
      { label: "Waiting on suppliers", value: `${count("to_source")} ${count("to_source") === 1 ? "order" : "orders"}`, note: lateRows.length ? `${lateRows.length} supplier late` : "None late", noteTone: lateRows.length ? "bad" : undefined, href: "/dashboard/catalogue" },
      { label: "On-time delivery", value: t.pct === null ? "-" : `${t.pct}%`, note: t.n ? `${t.hit} of ${t.n}` : "No deliveries yet", href: "/dashboard/analytics?tab=delivery" },
    ];
  };

  // the week, Monday to Sunday, against the team's sales target
  const sums = new Map<string, number>();
  for (const p of (pays.data ?? []) as { amount: number | string; confirmed_at: string }[]) sums.set(p.confirmed_at.slice(0, 10), (sums.get(p.confirmed_at.slice(0, 10)) ?? 0) + Number(p.amount));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = iso(Date.parse(weekStart) + i * DAY);
    return { label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], amount: sums.get(d) ?? 0, today: d === date, future: d > date };
  });
  const paid = days.reduce((s, d) => s + d.amount, 0);

  type T = { staff_id: string | null; staff: string; owner_kind: string; metric: string; goal: number | string; actual: number | string; to: string; from: string; status: string; elapsed: number | string; label: string | null };
  const active = ((tp.data ?? []) as T[]).filter((t) => t.status === "active" && t.to >= date);
  const sales = active.filter((t) => t.metric === "paid_sales" && t.from <= date);
  const teamGoal = sales.find((t) => t.owner_kind === "everyone") ?? null;
  const goal = teamGoal ? Number(teamGoal.goal) : sales.length ? sales.reduce((s, t) => s + Number(t.goal), 0) : null;
  const daysLeft = 7 - dow;
  const paceNeeded = goal !== null ? Math.max(0, Math.round((goal - paid) / Math.max(1, daysLeft))) : null;

  const { data: people } = await db.from("staff").select("id, branch, role:roles(name)");
  const who = new Map(((people ?? []) as unknown as { id: string; branch: string; role: { name: string } | { name: string }[] | null }[]).map((p) => [p.id, `${(Array.isArray(p.role) ? p.role[0]?.name : p.role?.name) ?? ""}${p.branch === "both" ? "" : `, ${p.branch[0].toUpperCase()}${p.branch.slice(1)}`}`]));
  const team = active.slice(0, 5).map((t) => {
    const goalN = Number(t.goal), actual = Number(t.actual), pace = paceOf(actual, goalN, Number(t.elapsed));
    return { name: t.staff, role: t.staff_id ? (who.get(t.staff_id) ?? "") : "Team", text: `${formatMetric(t.metric, actual)} of ${formatMetric(t.metric, goalN)} ${(t.label ?? metricLabels[t.metric]?.name ?? t.metric).toLowerCase()}`, pct: pace.pct, pace: pace.label, tone: pace.tone };
  });

  const bySource = new Map<string, number>();
  for (const r of (recent.data ?? []) as { source: string | null }[]) bySource.set(r.source ?? "Not given", (bySource.get(r.source ?? "Not given") ?? 0) + 1);

  const attention: OwnerView["attention"] = [];
  for (const l of lateRows.slice(0, 2)) { const n = (Array.isArray(l.order) ? l.order[0]?.number : l.order?.number) ?? ""; attention.push({ tag: "Supplier late", text: `${n} was due ${l.expected_at}`, href: `/dashboard/orders/${n}`, tone: "bad" }); }
  for (const r of rows.filter((x) => x.payment_state === "pending_check").slice(0, 2)) attention.push({ tag: "Check", text: `Manual MoMo payment for ${r.number} waiting`, href: `/dashboard/orders/${r.number}`, tone: "warn" });
  for (const r of slow.slice(0, 2)) attention.push({ tag: "Stuck", text: `${r.number} not confirmed for ${Math.round(hours(r))} h${r.agent_name ? ` · ${r.agent_name}` : ""}`, href: `/dashboard/orders/${r.number}`, tone: "warn" });
  if ((refunds.count ?? 0) > 0) attention.push({ tag: "Refunds", text: `${refunds.count} waiting for a decision`, href: "/dashboard/orders", tone: "warn" });
  const unchecked = (stale.data as { not_checked?: number } | null)?.not_checked ?? 0;
  if (unchecked > 0) attention.push({ tag: "Suppliers", text: `${unchecked} items not confirmed with suppliers for 7 days`, href: "/dashboard/catalogue", tone: "info" });

  const hour = new Date(now).getUTCHours();
  return {
    greeting: `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${me.fullName.split(" ")[0]}`,
    periods: { today: cards(today, "today"), week: cards(week, "week"), month: cards(month, "month") },
    week: { goal, paid, daysLeft, paceNeeded, days },
    stages: [
      { label: "Awaiting payment or check", count: count("awaiting_payment") }, { label: "To confirm", note: slow.length ? `${slow.length} waiting over 2 hours` : undefined, count: count("to_confirm"), tone: slow.length ? "warn" : undefined },
      { label: "Getting from supplier", count: count("to_source") }, { label: "Packed", count: count("ready_to_pack") + count("packed") }, { label: "Dispatched", count: count("dispatched") }, { label: "Out for delivery", count: count("out_for_delivery") },
      { label: "Delivered this week", count: done.filter((d) => d.delivered_at.slice(0, 10) >= weekStart).length }, { label: "Failed delivery", count: count("failed_delivery"), tone: count("failed_delivery") ? "bad" : undefined },
    ],
    sources: [...bySource.entries()].map(([source, n]) => ({ source, count: n })).sort((a, b) => b.count - a.count).slice(0, 6),
    team,
    attention,
  };
}
