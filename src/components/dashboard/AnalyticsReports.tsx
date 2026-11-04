import Link from "next/link";
import { DayBars, Sparkline } from "@/components/dashboard/Charts";
import { Pill, Progress, Table } from "@/components/dashboard/DashShell";
import { requireStaff } from "@/lib/auth";
import { lastDays } from "@/lib/period";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

type K = Record<string, number | null>;
const ghs = (n: unknown) => (n === null || n === undefined ? "n/a" : `GHS ${Number(n).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`);
const num = (n: unknown) => (n === null || n === undefined ? "n/a" : Number(n).toLocaleString("en-GH"));
const pct = (n: unknown) => (n === null || n === undefined ? "n/a" : `${n}%`);
const hrs = (n: unknown) => (n === null || n === undefined ? "n/a" : `${n} h`);

function Card({ label, value, now, prev, series, href, good = "up" }: { label: string; value: string; now: number | null | undefined; prev: number | null | undefined; series?: { x: string; y: number }[]; href?: string; good?: "up" | "down" }) {
  const change = now === null || now === undefined || !prev ? null : Math.round(((now - prev) / Math.abs(prev)) * 100);
  const better = change === null || change === 0 ? null : change > 0 === (good === "up");
  const body = (
    <>
      <p className="text-sm text-text2">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className={`text-xs ${better === null ? "text-text2" : better ? "text-success" : "text-error"}`}>{change === null ? `Previous: ${prev ?? "none"}` : `${change > 0 ? "▲" : change < 0 ? "▼" : ""} ${Math.abs(change)}% vs previous period`}</p>
      {series && <Sparkline points={series} label={label} />}
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:ring-2 hover:ring-navy">{body}</Link> : <div className="card p-4">{body}</div>;
}

/** KPI overview (FR-DB-004, FR-AN-001): number, change against the previous period, trend, and a link to the detail report. */
export async function Overview({ days }: { days: number }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("kpi_report", { p_from: from, p_to: to });
  if (error || !data) return <p className="card p-6 text-sm text-text2">Your role has no overview here.</p>;
  const d = data as { current: K; previous: K; money_visible: boolean; series: { day: string; orders: number; sales: number | null; visits: number }[]; regions: { region: string; orders: number }[]; payment_methods: { method: string; count: number }[]; categories: { category: string; units: number }[] };
  const c = d.current, p = d.previous;
  const orders = d.series.map((s) => ({ x: s.day, y: s.orders }));
  const sales = d.series.map((s) => ({ x: s.day, y: Number(s.sales ?? 0) }));
  const visits = d.series.map((s) => ({ x: s.day, y: s.visits }));
  const top = (l: { n: number }[]) => Math.max(1, ...l.map((x) => x.n));
  const regions = d.regions.map((r) => ({ l: r.region, n: r.orders }));
  const methods = d.payment_methods.map((r) => ({ l: r.method, n: r.count }));
  const cats = d.categories.map((r) => ({ l: r.category, n: r.units }));
  const list = (title: string, rows: { l: string; n: number }[]) => (
    <section className="card p-4 text-sm"><h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-text2">Nothing yet.</p> : <ul className="mt-3 space-y-2">{rows.slice(0, 8).map((r) => <li key={r.l}><p className="flex justify-between"><span>{r.l}</span><b>{r.n}</b></p><Progress pct={(r.n / top(rows)) * 100} /></li>)}</ul>}
    </section>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.money_visible && <Card label="Net sales" value={ghs(c.net_sales)} now={c.net_sales} prev={p.net_sales} series={sales} />}
        {d.money_visible && <Card label="Cash received" value={ghs(c.cash_received)} now={c.cash_received} prev={p.cash_received} />}
        <Card label="Orders" value={num(c.orders)} now={c.orders} prev={p.orders} series={orders} href="?tab=funnel" />
        {d.money_visible && <Card label="Average order value" value={ghs(c.aov)} now={c.aov} prev={p.aov} />}
        <Card label="Sessions" value={num(c.sessions)} now={c.sessions} prev={p.sessions} series={visits} href="?tab=sources" />
        <Card label={`Conversion (${num(c.orders)} of ${num(c.sessions)})`} value={pct(c.conversion)} now={c.conversion} prev={p.conversion} href="?tab=funnel" />
        <Card label="Cart abandonment" value={pct(c.cart_abandonment)} now={c.cart_abandonment} prev={p.cart_abandonment} good="down" />
        <Card label="Payment success" value={pct(c.payment_success)} now={c.payment_success} prev={p.payment_success} />
        <Card label="Half-payment share" value={pct(c.half_payment_share)} now={c.half_payment_share} prev={p.half_payment_share} />
        <Card label={`New / repeat customers`} value={`${num(c.new_customers)} / ${num(c.repeat_customers)}`} now={c.new_customers} prev={p.new_customers} href="?tab=customers" />
        <Card label="Repeat rate (90 days)" value={pct(c.repeat_rate_90)} now={c.repeat_rate_90} prev={p.repeat_rate_90} />
        <Card label="Time to confirm" value={hrs(c.time_to_confirm_h)} now={c.time_to_confirm_h} prev={p.time_to_confirm_h} good="down" href="?tab=delivery" />
        <Card label="Time to source" value={hrs(c.time_to_source_h)} now={c.time_to_source_h} prev={p.time_to_source_h} good="down" />
        <Card label="Could not source" value={pct(c.could_not_source_rate)} now={c.could_not_source_rate} prev={p.could_not_source_rate} good="down" />
        <Card label="Fulfilment time" value={c.fulfilment_days === null ? "n/a" : `${c.fulfilment_days} days`} now={c.fulfilment_days} prev={p.fulfilment_days} good="down" />
        <Card label="On-time delivery" value={pct(c.on_time_rate)} now={c.on_time_rate} prev={p.on_time_rate} href="?tab=delivery" />
        <Card label="Failed deliveries" value={pct(c.failed_delivery_rate)} now={c.failed_delivery_rate} prev={p.failed_delivery_rate} good="down" />
        {c.gross_margin !== undefined && c.gross_margin !== null && <Card label="Gross margin" value={pct(c.gross_margin)} now={c.gross_margin} prev={p.gross_margin} />}
        <Card label="Customer satisfaction" value={c.satisfaction === null ? "n/a" : `${c.satisfaction} of 5`} now={c.satisfaction} prev={p.satisfaction} />
        <Card label="Drip School views" value={num(c.article_views)} now={c.article_views} prev={p.article_views} />
        <Card label="Daily reports filed" value={pct(c.report_completion)} now={c.report_completion} prev={p.report_completion} />
      </div>
      <section className="card p-4"><h2 className="mb-3 font-semibold">Orders per day</h2><DayBars points={orders} label="Orders per day" /></section>
      <div className="grid gap-4 lg:grid-cols-3">{list("Orders by region", regions)}{list("Payment methods", methods)}{list("Units by category", cats)}</div>
      <p className="text-xs text-text2">Traffic is small at this stage, so rates swing. Read the counts next to them.</p>
    </div>
  );
}

/** Funnel (FR-AN-002): each step, its count and the drop from the step before; split by device, source or region. */
export async function Funnel({ days, split }: { days: number; split: string }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("funnel_report", { p_from: from, p_to: to, p_split: split || null });
  if (error) return <p className="card p-6 text-sm text-text2">Your role cannot see the funnel.</p>;
  const segs = (data ?? []) as { segment: string; steps: { step: string; count: number }[] }[];
  return (
    <div className="space-y-4">
      <nav className="flex gap-2 text-sm">{[["", "All"], ["device", "By device"], ["utm_source", "By source"], ["region", "By region"]].map(([k, l]) => <Link key={k} href={`?tab=funnel&days=${days}&split=${k}`} className={`chip min-h-9 px-3 ${split === k ? "bg-navy text-white" : "bg-white text-navy"}`}>{l}</Link>)}</nav>
      {segs.length === 0 && <p className="card p-6 text-sm text-text2">No visits recorded in this period.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {segs.map((s) => {
          const first = Math.max(1, s.steps[0]?.count ?? 1);
          return (
            <section key={s.segment} className="card p-4 text-sm"><h2 className="font-semibold capitalize">{s.segment}</h2>
              <ul className="mt-3 space-y-3">{s.steps.map((st, i) => {
                const prev = i ? s.steps[i - 1].count : 0;
                return <li key={st.step}><p className="flex justify-between"><span>{st.step}</span><b>{st.count} {i > 0 && prev > 0 && <span className="font-normal text-text2">(−{Math.max(0, Math.round((1 - st.count / prev) * 100))}%)</span>}</b></p><Progress pct={(st.count / first) * 100} /></li>;
              })}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Sources (FR-AN-003): where the link says they came from, next to what they told us. */
export async function Sources({ days }: { days: number }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("source_report", { p_from: from, p_to: to });
  if (error || !data) return <p className="card p-6 text-sm text-text2">Your role cannot see sources.</p>;
  const d = data as { self_reported: { source: string; orders: number; net_sales: number | null }[]; tracked: { source: string; orders: number; net_sales: number | null }[]; compare: { tracked: string; said: string; orders: number }[]; cost_per_order: { campaign: string; spend: number; orders: number }[] | null };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section><h2 className="mb-2 font-semibold">What customers told us</h2><Table head={["Source", "Orders", "Net sales"]} rows={d.self_reported.map((r) => [r.source, r.orders, r.net_sales === null ? "Hidden" : ghs(r.net_sales)])} /></section>
      <section><h2 className="mb-2 font-semibold">Tracked from the link</h2><Table head={["Source", "Orders", "Net sales"]} rows={d.tracked.map((r) => [r.source, r.orders, r.net_sales === null ? "Hidden" : ghs(r.net_sales)])} /></section>
      <section className="lg:col-span-2"><h2 className="mb-2 font-semibold">Side by side</h2><Table head={["Tracked", "They said", "Orders"]} rows={d.compare.map((r) => [r.tracked, r.said, r.orders])} /></section>
      {d.cost_per_order && d.cost_per_order.length > 0 && <section className="lg:col-span-2"><h2 className="mb-2 font-semibold">Cost per order by campaign</h2><Table head={["Campaign", "Ad spend", "Orders", "Cost per order"]} rows={d.cost_per_order.map((r) => [r.campaign, ghs(r.spend), r.orders, r.orders ? ghs(Number(r.spend) / r.orders) : "n/a"])} /></section>}
    </div>
  );
}

export async function Delivery({ days }: { days: number }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("delivery_report", { p_from: from, p_to: to });
  if (error || !data) return <p className="card p-6 text-sm text-text2">Your role cannot see the delivery report.</p>;
  const d = data as { stages: Record<string, number | null>; by_region: { region: string; delivered: number; on_time: number; failed: number }[]; by_courier: { courier: string; delivered: number; on_time: number; failed: number }[] };
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% (${a} of ${b})` : "n/a");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Placed to confirmed", "placed_to_confirmed_h"], ["Confirmed to received", "confirmed_to_received_h"], ["Received to dispatched", "received_to_dispatched_h"], ["Dispatched to delivered", "dispatched_to_delivered_h"]].map(([l, k]) => <div key={k} className="card p-4"><p className="text-sm text-text2">{l}</p><p className="mt-1 text-2xl font-bold">{hrs(d.stages[k])}</p></div>)}
      </div>
      <h2 className="font-semibold">By region</h2>
      <Table head={["Region", "Delivered", "On time", "Failed attempts"]} rows={d.by_region.map((r) => [r.region, r.delivered, rate(r.on_time, r.delivered), r.failed])} />
      <h2 className="font-semibold">By rider or courier</h2>
      <Table head={["Rider or courier", "Delivered", "On time", "Failed attempts"]} rows={d.by_courier.map((r) => [r.courier, r.delivered, rate(r.on_time, r.delivered), r.failed])} />
    </div>
  );
}

export async function Products({ days }: { days: number }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("product_report", { p_from: from, p_to: to });
  if (error || !data) return <p className="card p-6 text-sm text-text2">Your role cannot see the product report.</p>;
  const d = data as { products: { name: string; views: number; adds: number; wishlist: number; units: number; revenue: number | null; margin: number | null }[]; no_result_searches: { term: string; count: number }[]; top_searches: { term: string; count: number }[] };
  return (
    <div className="space-y-4">
      <Table head={["Product", "Views", "Added to bag", "Add rate", "Wishlist", "Units sold", "Sales", "Margin"]} rows={d.products.slice(0, 50).map((p) => [p.name, p.views, p.adds, p.views ? `${Math.round((p.adds / p.views) * 100)}%` : "n/a", p.wishlist, p.units, p.revenue === null ? "Hidden" : ghs(p.revenue), p.margin === null ? "" : `${p.margin}%`])} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section><h2 className="mb-2 font-semibold">Searches with no results</h2>{d.no_result_searches.length ? <Table head={["Search", "Times"]} rows={d.no_result_searches.map((s) => [s.term, s.count])} /> : <p className="card p-4 text-sm text-text2">None. Shoppers are finding things.</p>}</section>
        <section><h2 className="mb-2 font-semibold">Most searched</h2>{d.top_searches.length ? <Table head={["Search", "Times"]} rows={d.top_searches.map((s) => [s.term, s.count])} /> : <p className="card p-4 text-sm text-text2">No searches yet.</p>}</section>
      </div>
    </div>
  );
}

export async function Customers({ days }: { days: number }) {
  const { from, to } = await lastDays(days);
  const { data, error } = await (await createClient()).rpc("customer_report", { p_from: from, p_to: to });
  if (error || !data) return <p className="card p-6 text-sm text-text2">Your role cannot see the customer report.</p>;
  const d = data as { average_ltv: number | null; by_region: { region: string; customers: number }[]; top_customers: { id: string; name: string; orders: number; spend: number }[] | null; birthdays: { id: string; name: string; day: number }[]; cohorts: { cohort: string; size: number; months: { m: number; repeat: number }[] }[] };
  return (
    <div className="space-y-4">
      {d.average_ltv !== null && <div className="card w-fit p-4"><p className="text-sm text-text2">Average lifetime value</p><p className="mt-1 text-2xl font-bold">{ghs(d.average_ltv)}</p></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.top_customers && <section><h2 className="mb-2 font-semibold">Top customers</h2><Table head={["Customer", "Orders", "Spend"]} rows={d.top_customers.map((c) => [<Link key={c.id} href={`/dashboard/customers/${c.id}`} className="text-navy underline">{c.name}</Link>, c.orders, ghs(c.spend)])} /></section>}
        <section><h2 className="mb-2 font-semibold">Customers by region</h2><Table head={["Region", "Customers"]} rows={d.by_region.map((r) => [r.region, r.customers])} /></section>
      </div>
      <section><h2 className="mb-2 font-semibold">Repeat purchases by first-purchase month</h2>
        {d.cohorts.length === 0 ? <p className="card p-4 text-sm text-text2">Not enough orders yet.</p> : <Table head={["First bought", "Customers", "+1 month", "+2", "+3", "+4", "+5"]} rows={d.cohorts.map((c) => [new Date(c.cohort).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), c.size, ...c.months.map((m) => `${m.repeat} (${Math.round((m.repeat / c.size) * 100)}%)`)])} />}
      </section>
      <section><h2 className="mb-2 font-semibold">Birthdays this month (with marketing consent)</h2>{d.birthdays.length ? <ul className="card space-y-1 p-4 text-sm">{d.birthdays.map((b) => <li key={b.id}>{b.day}: <Link href={`/dashboard/customers/${b.id}`} className="text-navy underline">{b.name}</Link></li>)}</ul> : <p className="card p-4 text-sm text-text2">None.</p>}</section>
    </div>
  );
}

/** Staff performance linked to targets (FR-AN-006). */
export async function Team({ days }: { days: number }) {
  const [{ from, to }, me] = await Promise.all([lastDays(days), requireStaff()]);
  if (!can(me.permissions, "targets_set", "view")) return <p className="card p-6 text-sm text-text2">Your own numbers are under Staff and targets.</p>;
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("id, full_name").eq("active", true).order("full_name");
  const cards = await Promise.all(((staff ?? []) as { id: string; full_name: string }[]).map(async (s) => ({ s, d: (await supabase.rpc("staff_scorecard", { p_staff: s.id, p_from: from, p_to: to })).data as { score: number | null; report_completion: number | null; on_time_rate: number | null; deliveries: number } | null })));
  return <Table head={["Person", "Score", "Reports", "On time", "Deliveries"]} rows={cards.map(({ s, d }) => [<Link key={s.id} href={`/dashboard/staff/${s.id}`} className="text-navy underline">{s.full_name}</Link>, d?.score === null || d?.score === undefined ? "No targets" : <Pill key="p" tone={d.score >= 100 ? "ok" : d.score >= 70 ? "warn" : "bad"}>{d.score}%</Pill>, pct(d?.report_completion), pct(d?.on_time_rate), d?.deliveries ?? 0])} />;
}

export async function Feedback() {
  const { data } = await (await createClient()).from("site_feedback").select("id, created_at, page, rating, message").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: number; created_at: string; page: string | null; rating: number | null; message: string }[];
  return rows.length ? <Table head={["When", "Page", "Rating", "Message"]} rows={rows.map((r) => [new Date(r.created_at).toLocaleDateString("en-GB"), r.page ?? "", r.rating ?? "", r.message])} /> : <p className="card p-6 text-sm text-text2">No feedback yet.</p>;
}
