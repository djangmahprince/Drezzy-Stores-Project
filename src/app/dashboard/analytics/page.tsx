import { Guard } from "@/components/dashboard/Guard";
import { Kpi, PageHead, Progress, Table } from "@/components/dashboard/DashShell";

export const metadata = { title: "Analytics" };

const funnel: [string, number][] = [["Visit", 1200], ["Product view", 640], ["Add to cart", 180], ["Checkout started", 95], ["Payment started", 70], ["Order placed", 58], ["Paid", 46], ["Delivered", 40]];

export default function Analytics() {
  return (
    <Guard module="analytics">
      <PageHead title="Analytics" sub="What sold, who bought, where they came from, and where we lose people" actions={<button className="btn-outline">Export</button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gross sales" value="GHS 19,200" note="46 paid orders" />
        <Kpi label="Average order value" value="GHS 401" />
        <Kpi label="Conversion rate" value="3.8%" note="46 of 1,200 visits" />
        <Kpi label="New vs repeat" value="39 / 7" note="Counts shown next to every rate" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Sales funnel</h2>
          <ul className="mt-3 space-y-3">{funnel.map(([s, n], i) => (
            <li key={s}><p className="flex justify-between"><span>{s}</span><b>{n.toLocaleString()} {i > 0 && <span className="font-normal text-text2">(−{Math.round((1 - n / funnel[i - 1][1]) * 100)}%)</span>}</b></p><Progress pct={(n / 1200) * 100} /></li>
          ))}</ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Tracked source vs self-reported</h2>
          <Table head={["Source", "Tracked", "Self-reported"]} rows={[["Instagram", "14", "16"], ["TikTok", "9", "10"], ["Direct link", "12", "0"], ["WhatsApp", "7", "8"], ["Friend or relative", "0", "6"]]} />
          <p className="mt-2 text-xs text-text2">Often disagree: for example arrived by direct link but said &ldquo;friend or relative&rdquo;.</p>
        </section>
      </div>
    </Guard>
  );
}
