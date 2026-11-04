"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Kpi, PageHead, Pill, Progress, Segmented } from "@/components/dashboard/DashShell";
import type { OwnerView, Period } from "@/lib/dashboard/owner-types";

const money = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GH")}`;
const short = (n: number) => (n >= 1000 ? `GHS ${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `GHS ${Math.round(n)}`);
const periods = [["today", "Today"], ["week", "This week"], ["month", "This month"]] as const;
const subs: Record<Period, string> = { today: "today", week: "this week", month: "this month" };
const attentionTone = { bad: "bg-[#fbe4e4] text-error", warn: "bg-[#fbeedb] text-warning", info: "bg-card text-text2" };

/** One bar per day, with the daily pace the team needs for the rest of the week drawn across. */
function WeekChart({ w }: { w: OwnerView["week"] }) {
  const peak = Math.max(1, ...w.days.map((d) => d.amount), w.paceNeeded ?? 0) * 1.1;
  const step = peak > 2000 ? 1000 : peak > 200 ? 100 : 10;
  const top = Math.ceil(peak / (step * 2)) * step * 2; // half of it is a round number too
  const y = (n: number) => `${(n / top) * 100}%`;
  return (
    <div className="mt-6 grid grid-cols-[56px_1fr] gap-2">
      <div className="relative h-52 text-xs text-text2" aria-hidden="true">
        {[top, top / 2, 0].map((n) => <span key={n} className="absolute right-0 translate-y-1/2 whitespace-nowrap" style={{ bottom: y(n) }}>{n ? short(n) : "0"}</span>)}
      </div>
      <div>
        <div className="relative h-52 border-b border-line" role="img" aria-label={`Paid each day this week: ${w.days.map((d) => `${d.label} ${money(d.amount)}`).join(", ")}`}>
          <div className="absolute inset-0 flex items-end justify-around gap-2">
            {w.days.map((d) => (
              <div key={d.label} title={`${d.label}: ${money(d.amount)}`} className={`w-full max-w-12 rounded-t-[8px] ${d.future ? "bg-card" : d.today ? "border-2 border-b-0 border-navy bg-lime" : "bg-navy"}`} style={{ height: d.future ? "8px" : `max(4px, ${y(d.amount)})` }} />
            ))}
          </div>
          {w.paceNeeded !== null && w.paceNeeded > 0 && (
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-warning" style={{ bottom: y(w.paceNeeded) }}>
              <span className="absolute -top-5 right-0 bg-white pl-1 text-xs font-semibold text-warning">Daily pace needed: {money(w.paceNeeded)}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-around gap-2 text-xs text-text2">{w.days.map((d) => <span key={d.label} className={`w-full max-w-12 text-center ${d.today ? "font-semibold text-navy" : ""}`}>{d.label}{d.today ? " (today)" : ""}</span>)}</div>
      </div>
    </div>
  );
}

export function OwnerHome({ v, real }: { v: OwnerView; real: boolean }) {
  const [p, setP] = useState<Period>("week");
  const sourceTotal = v.sources.reduce((s, x) => s + x.count, 0);
  const sourceTop = Math.max(1, ...v.sources.map((s) => s.count));
  const pct = v.week.goal ? Math.round((v.week.paid / v.week.goal) * 100) : null;
  return (
    <>
      <PageHead real={real} title={v.greeting} sub={`How Drezzy is doing ${subs[p]}`} actions={<Segmented options={periods} value={p} onChange={setP} label="Period" />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-live="polite">
        {v.periods[p].map((k) => <Kpi key={k.label} {...k} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Sales against the weekly target</h2>
            <p className="text-sm text-text2">{v.week.goal ? `${money(v.week.paid)} of ${money(v.week.goal)} · ${pct}% with ${v.week.daysLeft} ${v.week.daysLeft === 1 ? "day" : "days"} left` : `${money(v.week.paid)} so far. No team target set.`}</p>
          </div>
          <WeekChart w={v.week} />
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Orders by stage</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {v.stages.map((s) => <li key={s.label} className={`flex justify-between gap-2 ${s.tone === "warn" ? "text-warning" : s.tone === "bad" ? "text-error" : ""}`}><span>{s.label}{s.note ? ` · ${s.note}` : ""}</span><b>{s.count}</b></li>)}
          </ul>
          <Link href="/dashboard/dispatch" className="mt-4 inline-block text-sm font-semibold text-navy underline">Open dispatch board</Link>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Where buyers heard of Drezzy</h2><span className="text-sm text-text2">{sourceTotal} orders</span></div>
          {v.sources.length === 0 ? <p className="mt-3 text-sm text-text2">No orders this week yet.</p> : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {v.sources.map((s) => <li key={s.source} className="grid grid-cols-[1fr_1fr_24px] items-center gap-3"><span className="truncate">{s.source}</span><Progress pct={(s.count / sourceTop) * 100} /><b className="text-right">{s.count}</b></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-text2">Self-reported answer from checkout. Tracked link source is in Analytics.</p>
        </section>
        <section className="card p-4">
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Team targets this week</h2><Link href="/dashboard/staff" className="text-sm font-semibold text-navy underline">All targets</Link></div>
          {v.team.length === 0 ? <p className="mt-3 text-sm text-text2">No active targets yet.</p> : (
            <ul className="mt-3 space-y-3 text-sm">
              {v.team.map((t) => (
                <li key={t.name + t.text} className="flex items-center gap-3">
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center justify-between gap-2"><span className="truncate"><b>{t.name}</b>{t.role ? ` · ${t.role}` : ""}</span><Pill tone={t.tone}>{t.pace}</Pill></p>
                    <div className="mt-1"><Progress pct={t.pct} tone={t.tone} /></div>
                    <p className="mt-1 truncate text-xs text-text2">{t.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Needs attention</h2>
          {v.attention.length === 0 ? <p className="mt-3 text-sm text-text2">Nothing is stuck right now.</p> : (
            <ul className="mt-3 space-y-2 text-sm">
              {v.attention.map((a, i) => <li key={i}><Link href={a.href} className={`flex gap-3 rounded-[10px] px-3 py-2 ${attentionTone[a.tone]}`}><b className="shrink-0">{a.tag}</b><span className="text-ink">{a.text}</span></Link></li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
