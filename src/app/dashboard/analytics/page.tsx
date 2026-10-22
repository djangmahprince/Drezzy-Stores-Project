import { Suspense } from "react";
import { AnalyticsLive } from "@/components/dashboard/AnalyticsLive";
import { Kpi, PageHead, Progress, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { getAnalytics, ranges } from "@/lib/analytics/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Analytics" };

const funnel: [string, number][] = [["Visit", 1200], ["Product view", 640], ["Add to cart", 180], ["Checkout started", 95], ["Payment started", 70], ["Order placed", 58], ["Paid", 46], ["Delivered", 40]];

function Sample() {
  return (
    <>
      <PageHead title="Analytics" sub="Sample figures. Connect Supabase to see your own." />
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
          <h2 className="mb-2 font-semibold">Where orders came from</h2>
          <Table head={["Source", "Orders"]} rows={[["Instagram", "16"], ["TikTok", "10"], ["WhatsApp", "8"], ["Friend or relative", "6"]]} />
        </section>
      </div>
    </>
  );
}

async function Live({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const n = (ranges as readonly number[]).includes(Number(days)) ? Number(days) : 30;
  const a = await getAnalytics(n);
  if (!a) return <p className="card p-6 text-sm text-text2">Analytics could not be loaded. Please try again.</p>;
  return <AnalyticsLive a={a} />;
}

export default function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  return (
    <Guard module="analytics">
      {isSupabaseConfigured ? (
        <>
          <PageHead real title="Analytics" sub="What sold, who bought, where they came from, and where we lose people" />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
            <Live searchParams={searchParams} />
          </Suspense>
        </>
      ) : (
        <Sample />
      )}
    </Guard>
  );
}
