import "server-only";
import type { Staff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RoleTile = { label: string; value: string | number; href?: string };
export type RoleList = { title: string; empty: string; items: { text: string; href?: string; pct?: number }[] };
export type RoleHome = { tiles: RoleTile[]; lists: RoleList[]; actions: { label: string; href: string }[] };

const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GH")}`;
const sum = (rows: unknown, key: string) => ((rows ?? []) as Record<string, unknown>[]).reduce((s, r) => s + Number(r[key] ?? 0), 0);
const orderLink = (n: string) => `/dashboard/orders/${n}`;

type Db = Awaited<ReturnType<typeof createClient>>;
type Target = { staff: string; metric: string; goal: number; actual: number; from: string; to: string; status: string; label?: string | null };

async function targets(db: Db, today: string): Promise<Target[]> {
  const { data } = await db.rpc("target_progress", { p_date: today });
  return ((data ?? []) as Target[]).filter((t) => t.status === "active" && t.to >= today);
}
const targetItems = (ts: Target[]) => ts.slice(0, 6).map((t) => ({
  text: `${t.staff}: ${t.label ?? t.metric.replace(/_/g, " ")} ${Math.round(Number(t.actual))} of ${Math.round(Number(t.goal))}`,
  pct: Math.min(100, (Number(t.actual) / Number(t.goal)) * 100),
}));

async function money(db: Db, now: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  const week = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
  const month = `${day.slice(0, 7)}-01`;
  const { data } = await db.from("payments").select("amount, confirmed_at").eq("status", "success").neq("kind", "refund").gte("confirmed_at", month < week ? month : week);
  const rows = (data ?? []) as { amount: number | string; confirmed_at: string }[];
  const from = (d: string) => rows.filter((r) => r.confirmed_at >= d).reduce((s, r) => s + Number(r.amount), 0);
  return { today: from(day), week: from(week), month: from(month), monthStart: month };
}

/** The first screen for each role (PRD section 12). Every query runs as the person, so row-level security decides what counts. */
export async function getRoleHome(me: Staff, now: number): Promise<RoleHome> {
  const db = await createClient();
  const today = new Date(now).toISOString().slice(0, 10);
  const role = me.roleKey;

  if (role === "sales_agent") {
    const [confirm, unpaid, ts] = await Promise.all([
      db.from("orders").select("number, agent_name").eq("status", "to_confirm").order("created_at").limit(8),
      db.from("orders").select("number, balance_due").eq("status", "awaiting_payment").order("created_at").limit(8),
      targets(db, today),
    ]);
    return {
      tiles: [{ label: "To confirm", value: confirm.data?.length ?? 0, href: "/dashboard/orders" }, { label: "Follow-ups", value: unpaid.data?.length ?? 0, href: "/dashboard/orders" }],
      lists: [
        { title: "My orders to confirm", empty: "Nothing to confirm.", items: (confirm.data ?? []).map((o) => ({ text: o.number, href: orderLink(o.number) })) },
        { title: "My follow-ups", empty: "No unpaid orders to chase.", items: (unpaid.data ?? []).map((o) => ({ text: `${o.number} · ${ghs(Number(o.balance_due))} unpaid`, href: orderLink(o.number) })) },
        { title: "My targets", empty: "No targets set.", items: targetItems(ts) },
      ],
      actions: [{ label: "Create order", href: "/dashboard/orders/new" }],
    };
  }

  if (role === "sourcing_officer") {
    const [toSource, due, report] = await Promise.all([
      db.from("orders").select("number, supplier_orders(id)").eq("status", "to_source").order("created_at").limit(50),
      db.from("supplier_orders").select("id, expected_at, order:orders(number), supplier:suppliers(name)").eq("status", "ordered").lte("expected_at", today).order("expected_at").limit(8),
      db.rpc("catalogue_report", { p_stale_days: 7 }),
    ]);
    const place = ((toSource.data ?? []) as unknown as { number: string; supplier_orders: { id: string }[] }[]).filter((o) => o.supplier_orders.length === 0);
    const r = (report.data ?? {}) as { not_checked?: number; could_not_source?: number };
    type Due = { id: string; expected_at: string; order: { number: string } | { number: string }[] | null; supplier: { name: string } | { name: string }[] | null };
    const first = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
    return {
      tiles: [
        { label: "Supplier orders to place", value: place.length, href: "/dashboard/orders" }, { label: "Due from suppliers", value: due.data?.length ?? 0 },
        { label: "Not checked for 7 days", value: r.not_checked ?? 0, href: "/dashboard/catalogue" }, { label: "Could not be sourced", value: r.could_not_source ?? 0, href: "/dashboard/catalogue/reports" },
      ],
      lists: [
        { title: "Orders to place with suppliers", empty: "All placed.", items: place.slice(0, 8).map((o) => ({ text: o.number, href: orderLink(o.number) })) },
        { title: "Due today or late", empty: "Nothing due.", items: ((due.data ?? []) as unknown as Due[]).map((d) => ({ text: `${first(d.order)?.number} · ${first(d.supplier)?.name} · ${d.expected_at}`, href: orderLink(first(d.order)?.number ?? "") })) },
      ],
      actions: [{ label: "Open catalogue", href: "/dashboard/catalogue" }, { label: "Suppliers", href: "/dashboard/catalogue/suppliers" }],
    };
  }

  if (role === "dispatch_coordinator") {
    const { data } = await db.from("orders").select("number, status, region, rider_name, courier, balance_due").in("status", ["ready_to_pack", "packed", "dispatched", "out_for_delivery", "failed_delivery"]).limit(500);
    const rows = (data ?? []) as { number: string; status: string; region: string | null; rider_name: string | null; courier: string | null; balance_due: number | string }[];
    const n = (s: string) => rows.filter((r) => r.status === s).length;
    const road = rows.filter((r) => r.status === "dispatched" || r.status === "out_for_delivery");
    const group = (key: (r: (typeof rows)[number]) => string) => [...road.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>())].map(([k, c]) => ({ text: `${k}: ${c}` }));
    return {
      tiles: [
        { label: "To pack", value: n("ready_to_pack") + n("packed"), href: "/dashboard/dispatch" }, { label: "On the road", value: road.length, href: "/dashboard/dispatch" },
        { label: "Failed", value: n("failed_delivery"), href: "/dashboard/dispatch" }, { label: "Balances to collect", value: ghs(sum(road, "balance_due")) },
      ],
      lists: [
        { title: "Today by region", empty: "Nothing out yet.", items: group((r) => r.region ?? "Pickup") },
        { title: "Today by rider", empty: "Nothing out yet.", items: group((r) => r.rider_name ?? r.courier ?? "Not assigned") },
      ],
      actions: [{ label: "Open dispatch board", href: "/dashboard/dispatch" }],
    };
  }

  if (role === "content_editor") {
    const soon = new Date(now + 7 * 86_400_000).toISOString();
    const iso = new Date(now).toISOString();
    const [drafts, sched, banners, top] = await Promise.all([
      db.from("articles").select("id, title").in("status", ["draft", "in_review"]).order("updated_at", { ascending: false }).limit(8),
      db.from("articles").select("id, title, publish_at").eq("status", "published").gt("publish_at", iso).order("publish_at").limit(8),
      db.from("banners").select("id, title, ends_at").eq("active", true).gte("ends_at", iso).lte("ends_at", soon).order("ends_at").limit(8),
      db.rpc("article_metrics", { p_from: new Date(now - 29 * 86_400_000).toISOString().slice(0, 10), p_to: today }),
    ]);
    const best = ((top.data ?? []) as { title: string; views: number }[]).sort((a, b) => b.views - a.views).slice(0, 5);
    return {
      tiles: [{ label: "Drafts", value: drafts.data?.length ?? 0, href: "/dashboard/content" }, { label: "Scheduled", value: sched.data?.length ?? 0, href: "/dashboard/content?tab=calendar" }, { label: "Banners ending soon", value: banners.data?.length ?? 0, href: "/dashboard/content?tab=banners" }],
      lists: [
        { title: "Drafts", empty: "No drafts.", items: (drafts.data ?? []).map((a) => ({ text: a.title, href: `/dashboard/content/${a.id}` })) },
        { title: "Scheduled posts", empty: "Nothing scheduled.", items: (sched.data ?? []).map((a) => ({ text: `${a.title} · ${String(a.publish_at).slice(0, 10)}`, href: `/dashboard/content/${a.id}` })) },
        { title: "Top Drip School articles", empty: "No reads yet.", items: best.map((a) => ({ text: `${a.title} · ${a.views} views` })) },
        { title: "Banners that expire soon", empty: "None in the next 7 days.", items: (banners.data ?? []).map((b) => ({ text: `${b.title ?? "Banner"} · ${String(b.ends_at).slice(0, 10)}`, href: "/dashboard/content?tab=banners" })) },
      ],
      actions: [{ label: "New article", href: "/dashboard/content/new" }],
    };
  }

  if (role === "customer_support") {
    const [threads, refunds] = await Promise.all([
      db.from("support_threads").select("id, subject, complaint").neq("status", "closed").order("last_message_at", { ascending: false }).limit(50),
      db.from("refunds").select("id, amount, reason, order:orders(number)").eq("status", "requested").limit(8),
    ]);
    const open = (threads.data ?? []) as { id: string; subject: string; complaint: boolean }[];
    type R = { id: string; amount: number | string; reason: string; order: { number: string } | { number: string }[] | null };
    const num = (r: R) => (Array.isArray(r.order) ? r.order[0]?.number : r.order?.number) ?? "";
    return {
      tiles: [{ label: "Open conversations", value: open.length, href: "/dashboard/support" }, { label: "Complaints", value: open.filter((t) => t.complaint).length, href: "/dashboard/support" }, { label: "Refunds waiting", value: refunds.data?.length ?? 0 }],
      lists: [
        { title: "Open conversations", empty: "All answered.", items: open.slice(0, 8).map((t) => ({ text: `${t.complaint ? "Complaint: " : ""}${t.subject}`, href: "/dashboard/support" })) },
        { title: "Refunds waiting for a decision", empty: "None waiting.", items: ((refunds.data ?? []) as unknown as R[]).map((r) => ({ text: `${num(r)} · ${ghs(Number(r.amount))} · ${r.reason}`, href: orderLink(num(r)) })) },
      ],
      actions: [{ label: "Open support inbox", href: "/dashboard/support" }],
    };
  }

  if (role === "finance") {
    const m = await money(db, now);
    const [check, balances, refunds, expenses] = await Promise.all([
      db.from("orders").select("number").eq("payment_state", "pending_check").limit(8),
      db.from("orders").select("balance_due").gt("balance_due", 0).not("status", "in", "(cancelled)").limit(2000),
      db.from("refunds").select("amount").eq("status", "requested"),
      db.from("expenses").select("amount").gte("spent_on", m.monthStart),
    ]);
    const spent = sum(expenses.data, "amount");
    return {
      tiles: [
        { label: "Received today", value: ghs(m.today), href: "/dashboard/money" }, { label: "Received this month", value: ghs(m.month), href: "/dashboard/money" },
        { label: "Payments to check", value: check.data?.length ?? 0 }, { label: "Balances outstanding", value: ghs(sum(balances.data, "balance_due")) },
        { label: "Refunds waiting", value: ghs(sum(refunds.data, "amount")) }, { label: "Expenses this month", value: ghs(spent) }, { label: "Cash flow this month", value: ghs(m.month - spent) },
      ],
      lists: [{ title: "Manual MoMo payments to check", empty: "None waiting.", items: (check.data ?? []).map((o) => ({ text: o.number, href: orderLink(o.number) })) }],
      actions: [{ label: "Open money", href: "/dashboard/money" }],
    };
  }

  // Owner, Admin, and any custom role that can see orders
  const m = await money(db, now);
  const [ts, check, balances, supplier] = await Promise.all([
    targets(db, today),
    db.from("orders").select("id", { count: "exact", head: true }).eq("payment_state", "pending_check"),
    db.from("orders").select("balance_due").gt("balance_due", 0).not("status", "in", "(cancelled)").limit(2000),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "to_source"),
  ]);
  const sales = ts.find((t) => t.metric === "paid_sales");
  return {
    tiles: [
      { label: "Revenue today", value: ghs(m.today), href: "/dashboard/analytics" }, { label: "Last 7 days", value: ghs(m.week), href: "/dashboard/analytics" },
      { label: sales ? `This month, target ${ghs(Number(sales.goal))}` : "This month", value: ghs(m.month), href: "/dashboard/analytics" },
      { label: "Payments to check", value: check.count ?? 0, href: "/dashboard/orders" }, { label: "Balances to collect", value: ghs(sum(balances.data, "balance_due")), href: "/dashboard/money" }, { label: "Waiting on suppliers", value: supplier.count ?? 0, href: "/dashboard/orders" },
    ],
    lists: [{ title: "Team progress", empty: "No active targets. Set them under Staff and targets.", items: targetItems(ts) }],
    actions: [],
  };
}
