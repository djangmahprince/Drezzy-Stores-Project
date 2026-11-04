import Link from "next/link";
import { PageHead, Pill, Progress } from "@/components/dashboard/DashShell";
import { formatGHS } from "@/lib/data";
import type { HomeData } from "@/lib/dashboard/home";

export function HomeLive({ d }: { d: HomeData }) {
  const peak = Math.max(1, ...(d.days ?? []).map((x) => x.amount));
  const topSource = Math.max(1, ...d.sources.map((s) => s.count));
  return (
    <>
      <PageHead real title={`${d.greeting}${d.name ? `, ${d.name}` : ""}`} sub="What needs doing, from the orders and payments you can see" />
      {d.role.actions.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{d.role.actions.map((a, i) => <Link key={a.href} href={a.href} className={`${i === 0 ? "btn-primary" : "btn-outline"} !min-h-10`}>{a.label}</Link>)}</div>}
      <ul className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {d.role.tiles.map((t) => (
          <li key={t.label} className="card p-4">
            {t.href ? <Link href={t.href} className="block"><p className="text-sm text-text2">{t.label}</p><p className="text-2xl font-bold">{t.value}</p></Link> : <><p className="text-sm text-text2">{t.label}</p><p className="text-2xl font-bold">{t.value}</p></>}
          </li>
        ))}
      </ul>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {d.role.lists.map((l) => (
          <section key={l.title} className="card p-4">
            <h2 className="font-semibold">{l.title}</h2>
            {l.items.length === 0 ? <p className="mt-3 text-sm text-text2">{l.empty}</p> : (
              <ul className="mt-3 space-y-2 text-sm">
                {l.items.map((x, i) => <li key={i}>{x.href ? <Link href={x.href} className="underline">{x.text}</Link> : x.text}{x.pct !== undefined && <Progress pct={x.pct} />}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {d.days && (
          <section className="card p-4 lg:col-span-2">
            <h2 className="font-semibold">Money received, last 7 days</h2>
            <p className="text-sm text-text2">{formatGHS(d.weekTotal)} paid in this week</p>
            <div className="mt-4 flex h-40 items-end gap-3" role="img" aria-label="Money received by day">
              {d.days.map((x, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-[6px] bg-navy" style={{ height: `${Math.max(x.amount > 0 ? 4 : 0, (x.amount / peak) * 100)}%` }} title={formatGHS(x.amount)} />
                  <span className="text-xs text-text2">{x.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card p-4">
          <h2 className="font-semibold">Needs attention</h2>
          {d.attention.length === 0 ? <p className="mt-3 text-sm text-text2">Nothing is stuck right now.</p> : (
            <ul className="mt-3 space-y-3 text-sm">
              {d.attention.map((a, i) => (
                <li key={i}><Pill tone={a.tone}>{a.tag}</Pill> <Link href={a.href} className="underline">{a.text}</Link></li>
              ))}
            </ul>
          )}
        </section>

        {d.canOrders && (
          <section className="card p-4">
            <div className="flex justify-between"><h2 className="font-semibold">Open orders by stage</h2><Link href="/dashboard/dispatch" className="text-sm font-semibold text-navy">Dispatch board</Link></div>
            <ul className="mt-3 space-y-2 text-sm">
              {d.stages.map((s) => <li key={s.label} className="flex justify-between"><span>{s.label}</span><b>{s.count}</b></li>)}
            </ul>
          </section>
        )}

        {d.canOrders && (
          <section className="card p-4">
            <h2 className="font-semibold">Where buyers heard of Drezzy <span className="text-sm font-normal text-text2">{d.weekOrders} orders this week</span></h2>
            {d.sources.length === 0 ? <p className="mt-3 text-sm text-text2">No orders this week yet.</p> : (
              <ul className="mt-3 space-y-3 text-sm">
                {d.sources.map((s) => <li key={s.source}><p className="flex justify-between"><span>{s.source}</span><b>{s.count}</b></p><Progress pct={(s.count / topSource) * 100} /></li>)}
              </ul>
            )}
            <p className="mt-3 text-xs text-text2">Self-reported at checkout. See Analytics for more.</p>
          </section>
        )}

        <section className="card p-4">
          <div className="flex justify-between"><h2 className="font-semibold">Targets and reports</h2><Link href="/dashboard/staff" className="text-sm font-semibold text-navy">Open</Link></div>
          <p className="mt-3 text-sm text-text2">See how your targets are tracking and file your report for today.</p>
        </section>
      </div>
    </>
  );
}
