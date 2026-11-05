import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsLive } from "@/components/dashboard/AnalyticsLive";
import { Customers, Delivery, Feedback, Funnel, Overview, Products, Sources, Team } from "@/components/dashboard/AnalyticsReports";
import { CampaignLinks } from "@/components/dashboard/CampaignLinks";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Kpi, PageHead, Progress, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { getAnalytics, ranges } from "@/lib/analytics/staff";
import { lastDays } from "@/lib/period";
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

const tabs: [string, string][] = [["overview", "Overview"], ["funnel", "Funnel"], ["sources", "Sources"], ["delivery", "Delivery"], ["products", "Products"], ["customers", "Customers"], ["team", "Team"], ["links", "Campaign links"], ["feedback", "Feedback"]];
type Params = { days?: string; tab?: string; split?: string };

async function Live({ searchParams }: { searchParams: Promise<Params> }) {
  const [{ days, tab = "overview", split = "" }, me] = await Promise.all([searchParams, requireStaff()]);
  const n = (ranges as readonly number[]).includes(Number(days)) ? Number(days) : 30;
  const a = tab === "overview" ? await getAnalytics(n) : null;
  const { from, to } = await lastDays(n);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Reports">{tabs.map(([k, l]) => <Link key={k} href={`?tab=${k}&days=${n}`} aria-current={tab === k ? "page" : undefined} className={`chip min-h-9 shrink-0 px-3 ${tab === k ? "bg-navy text-white" : "bg-white text-navy"}`}>{l}</Link>)}</nav>
        <nav className="flex gap-1" aria-label="Period">{ranges.map((r) => <Link key={r} href={`?tab=${tab}&days=${r}`} className={`chip min-h-9 px-3 ${n === r ? "bg-navy text-white" : "bg-white text-navy"}`}>{r === 1 ? "Today" : r === 7 ? "This week" : r === 30 ? "This month" : `${r} days`}</Link>)}<a href={`/api/export?kind=analytics&format=xlsx&from=${from}&to=${to}`} className="chip min-h-9 bg-white px-3 text-navy">Export</a></nav>
      </div>
      {tab === "overview" && <><Overview days={n} />{a && <div className="mt-6"><AnalyticsLive a={a} /></div>}</>}
      {tab === "funnel" && <Funnel days={n} split={split} />}
      {tab === "sources" && <Sources days={n} />}
      {tab === "delivery" && <Delivery days={n} />}
      {tab === "products" && <Products days={n} />}
      {tab === "customers" && <Customers days={n} />}
      {tab === "team" && <Team days={n} />}
      {tab === "links" && <CampaignLinks canEdit={can(me.permissions, "analytics", "edit") || can(me.permissions, "content", "edit")} />}
      {tab === "feedback" && <Feedback />}
    </>
  );
}

export default function Analytics({ searchParams }: { searchParams: Promise<Params> }) {
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
