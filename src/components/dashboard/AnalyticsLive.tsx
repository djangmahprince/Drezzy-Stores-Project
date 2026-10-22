import Link from "next/link";
import { Kpi, Progress, Table } from "@/components/dashboard/DashShell";
import { ranges, type Analytics } from "@/lib/analytics/staff";

const ghs = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const channelWord: Record<string, string> = { web: "Web", whatsapp: "WhatsApp", phone: "Phone", instagram_dm: "Instagram DM", walk_in: "Walk-in" };

/** Rates always sit next to the counts they come from, so a small sample is not mistaken for a trend. */
export function AnalyticsLive({ a }: { a: Analytics }) {
  const top = Math.max(1, ...a.funnel.map((f) => f.count));
  const hasVisits = a.funnel[0]?.count > 0;
  return (
    <>
      <nav className="mb-4 flex gap-2" aria-label="Period">
        {ranges.map((r) => (
          <Link key={r} href={`/dashboard/analytics?days=${r}`} aria-current={r === a.days ? "page" : undefined} className={`chip min-h-9 px-4 text-sm ${r === a.days ? "bg-navy text-white" : "bg-white text-navy"}`}>Last {r} days</Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gross sales" value={a.grossSales === null ? "Not in your view" : ghs(a.grossSales)} note={`${a.paidOrders} paid orders`} />
        <Kpi label="Average order value" value={a.averageOrder === null ? "–" : ghs(a.averageOrder)} />
        <Kpi label="Orders placed" value={String(a.ordersPlaced)} note={`${a.delivered} delivered · ${a.cancelled} cancelled`} />
        <Kpi label="New vs repeat customers" value={`${a.newCustomers} / ${a.repeatCustomers}`} note="Customers who paid in this period" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Sales funnel</h2>
          {!hasVisits && <p className="mt-1 text-xs text-text2">Visit steps only fill in from the day the shop goes live. Orders, payments and deliveries are counted from the records.</p>}
          <ul className="mt-3 space-y-3">
            {a.funnel.map((f, i) => (
              <li key={f.step}>
                <p className="flex justify-between"><span>{f.step}</span><b>{f.count.toLocaleString()} {i > 0 && a.funnel[i - 1].count > 0 && <span className="font-normal text-text2">({pct(f.count, a.funnel[i - 1].count)} of the step before)</span>}</b></p>
                <Progress pct={(f.count / top) * 100} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text2">Conversion: {a.paidOrders} paid of {a.funnel[0]?.count ?? 0} visitors = {pct(a.paidOrders, a.funnel[0]?.count ?? 0)}</p>
        </section>
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 font-semibold">Where orders came from (as customers said)</h2>
            <Table head={["Source", "Orders"]} rows={a.sources.length ? a.sources.map((s) => [s.source, String(s.orders)]) : [["No orders yet", "–"]]} />
          </div>
          <div>
            <h2 className="mb-2 font-semibold">By channel</h2>
            <Table head={["Channel", "Orders"]} rows={a.channels.length ? a.channels.map((c) => [channelWord[c.channel] ?? c.channel, String(c.orders)]) : [["No orders yet", "–"]]} />
          </div>
        </section>
      </div>
      <section className="mt-4">
        <h2 className="mb-2 font-semibold">Best sellers</h2>
        <Table head={["Product", "Units", "Revenue"]} rows={a.topProducts.length ? a.topProducts.map((p) => [p.name, String(p.units), p.revenue === null ? "–" : ghs(p.revenue)]) : [["No paid orders in this period", "–", "–"]]} />
      </section>
    </>
  );
}
