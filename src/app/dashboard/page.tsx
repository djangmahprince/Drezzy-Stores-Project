import Link from "next/link";
import { PageHead, Pill, Progress } from "@/components/dashboard/DashShell";
import { PeriodKpis } from "@/components/dashboard/PeriodKpis";

const stages: [string, number][] = [
  ["Awaiting payment or check", 3], ["To confirm · 2 waiting over 2 hours", 5], ["Getting from supplier", 4],
  ["Packed", 4], ["Dispatched", 6], ["Out for delivery", 3], ["Delivered this week", 25], ["Failed delivery", 1],
];
const sourcesData: [string, number][] = [["Instagram", 16], ["TikTok", 10], ["WhatsApp", 8], ["Friend or relative", 6], ["Snapchat", 4], ["Walk-in", 2]];
const days = [3.1, 2.8, 4.2, 3.6, 4.7, 0, 0];

export const metadata = { title: "Dashboard" };

export default function DashboardHome() {
  return (
    <>
      <PageHead title="Good morning" sub="How Drezzy is doing this week, both branches" />
      <PeriodKpis />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="font-semibold">Sales against the weekly target</h2>
          <p className="text-sm text-text2">GHS 18,450 of GHS 25,000 · 74% with 2 days left · Daily pace needed: GHS 3,570</p>
          <div className="mt-4 flex h-40 items-end gap-3" aria-label="Sales by day">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-[6px] bg-navy" style={{ height: `${(d / 5) * 100}%` }} />
                <span className="text-xs text-text2">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Needs attention</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li><Pill tone="bad">Supplier late</Pill> New Balance 2000 · EU 41 · was due yesterday</li>
            <li><Pill tone="warn">Payment</Pill> Check Manual MoMo payment for DRZ-1035</li>
            <li><Pill tone="bad">Stuck</Pill> DRZ-1031 not confirmed for 3 h · Akosua</li>
            <li><Pill tone="warn">Suppliers</Pill> 12 items not confirmed with suppliers for 7 days</li>
          </ul>
        </section>

        <section className="card p-4">
          <div className="flex justify-between"><h2 className="font-semibold">Orders by stage</h2><Link href="/dashboard/dispatch" className="text-sm font-semibold text-navy">Open dispatch board</Link></div>
          <ul className="mt-3 space-y-2 text-sm">
            {stages.map(([s, n]) => <li key={s} className="flex justify-between"><span>{s}</span><b>{n}</b></li>)}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Where buyers heard of Drezzy <span className="text-sm font-normal text-text2">46 orders</span></h2>
          <ul className="mt-3 space-y-3 text-sm">
            {sourcesData.map(([s, n]) => (
              <li key={s}><p className="flex justify-between"><span>{s}</span><b>{n}</b></p><Progress pct={(n / 16) * 100} /></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text2">Self-reported answer from checkout. Tracked link source is in Analytics.</p>
        </section>

        <section className="card p-4">
          <div className="flex justify-between"><h2 className="font-semibold">Team targets this week</h2><Link href="/dashboard/staff" className="text-sm font-semibold text-navy">All targets</Link></div>
          <ul className="mt-3 space-y-4 text-sm">
            {[
              ["Kwame · Sales, Kumasi", "GHS 6,240 of 8,000 paid sales", 78, "ok", "On pace"],
              ["Akosua · Sales, Accra", "GHS 3,920 of 8,000 paid sales", 49, "bad", "Behind"],
              ["Yaw · Dispatch, Kumasi", "On-time delivery 93%, target 95%", 93, "ok", "On pace"],
              ["Esi · Content", "3 of 3 Journal posts published", 100, "ok", "Hit"],
            ].map(([who, what, pct, tone, label]) => (
              <li key={who as string}>
                <p className="flex justify-between font-medium"><span>{who}</span><Pill tone={tone as "ok" | "bad"}>{label}</Pill></p>
                <p className="text-text2">{what}</p>
                <Progress pct={pct as number} tone={tone as "ok" | "bad"} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
