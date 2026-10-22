"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTargetAction, fileReportAction, setTargetAction, type TeamResult } from "@/app/dashboard/staff/actions";
import { Kpi, Pill, Progress } from "@/components/dashboard/DashShell";
import { formatMetric, metricLabels, paceOf } from "@/lib/team/pace";
import type { TeamData } from "@/lib/team/staff";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

export function TeamLive({ d }: { d: TeamData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [rep, setRep] = useState({ summary: d.mine?.summary ?? "", blockers: d.mine?.blockers ?? "", orders: d.mine?.ordersHandled?.toString() ?? "" });
  const [t, setT] = useState({ staff: "", metric: "paid_sales", goal: "", from: d.today, to: addDays(d.today, 6), note: "" });

  function run(fn: () => Promise<TeamResult>, ok: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { text: ok, bad: false } : { text: res.error, bad: true });
      if (res.ok) { after?.(); router.refresh(); }
    });
  }

  const scored = d.targets.map((x) => ({ ...x, pace: paceOf(x.actual, x.goal, x.elapsed) }));
  const onTrack = scored.filter((x) => x.pace.tone === "ok").length;
  const filedToday = d.reports[0].rows.filter((r) => r.filed).length;

  return (
    <div className="space-y-4">
      {msg && <p role="status" className={`rounded-[12px] p-3 text-sm ${msg.bad ? "bg-[#fdecec] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Targets on pace or hit" value={scored.length ? `${onTrack} of ${scored.length}` : "None set"} note={scored.length ? `${scored.length - onTrack} need a check-in` : undefined} />
        {d.canSet && <Kpi label="Daily reports today" value={`${filedToday} of ${d.reports[0].rows.length}`} note="Everyone files one at the end of their day" />}
      </div>

      <section className="card divide-y divide-line" aria-label="Targets">
        {scored.length === 0 && <p className="p-4 text-sm text-text2">No targets yet.{d.canSet ? " Set one below." : " Your manager has not set one for this period."}</p>}
        {scored.map((x) => (
          <div key={x.id} className="grid items-center gap-2 p-4 text-sm md:grid-cols-[1.2fr_1.2fr_1.6fr_auto]">
            <b>{x.staff}</b>
            <span className="text-text2">{metricLabels[x.metric]?.name ?? x.metric}: {formatMetric(x.metric, x.goal)}<br /><span className="text-xs">{x.from} to {x.to}{x.note ? ` · ${x.note}` : ""}</span></span>
            <div><p>{formatMetric(x.metric, x.actual)} · {x.pace.pct}%</p><Progress pct={x.pace.pct} tone={x.pace.tone} /></div>
            <span className="flex items-center gap-2"><Pill tone={x.pace.tone}>{x.pace.label}</Pill>
              {d.canSet && <button type="button" disabled={pending} aria-label={`Remove target for ${x.staff}`} className="text-xs text-error underline" onClick={() => { if (window.confirm("Remove this target?")) run(() => deleteTargetAction(x.id), "Target removed."); }}>Remove</button>}
            </span>
          </div>
        ))}
      </section>

      {d.canSet && (
        <section className="card space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Set a target</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <select aria-label="Who" className="field !min-h-10" value={t.staff} onChange={(e) => setT({ ...t, staff: e.target.value })}>
              <option value="">Whole team</option>{d.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
            <select aria-label="Measure" className="field !min-h-10" value={t.metric} onChange={(e) => setT({ ...t, metric: e.target.value })}>
              {Object.entries(metricLabels).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
            <input aria-label="Goal" type="number" min={1} placeholder={metricLabels[t.metric].unit === "GHS" ? "Goal (GHS)" : "Goal (number)"} className="field !min-h-10" value={t.goal} onChange={(e) => setT({ ...t, goal: e.target.value })} />
            <label className="grid gap-1 text-xs text-text2">From<input type="date" className="field !min-h-10" value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-text2">To<input type="date" className="field !min-h-10" value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-text2">Note (optional)<input className="field !min-h-10" maxLength={200} value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></label>
          </div>
          <p className="text-xs text-text2">Progress is counted from real orders, supplier orders and reports. Nobody types in their own numbers.</p>
          <button type="button" disabled={pending || !t.goal} className="btn-primary !min-h-10 disabled:opacity-60" onClick={() => run(() => setTargetAction({ staffId: t.staff || null, metric: t.metric, goal: Number(t.goal), from: t.from, to: t.to, note: t.note }), "Target set.", () => setT({ ...t, goal: "", note: "" }))}>Set target</button>
        </section>
      )}

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Your report for today {d.mine && <Pill tone="ok">Filed</Pill>}</h2>
        <textarea aria-label="What did you do today" className="field min-h-24" maxLength={2000} placeholder="What you got done today" value={rep.summary} onChange={(e) => setRep({ ...rep, summary: e.target.value })} />
        <textarea aria-label="Anything blocking you" className="field min-h-16" maxLength={1000} placeholder="Anything blocking you? (optional)" value={rep.blockers} onChange={(e) => setRep({ ...rep, blockers: e.target.value })} />
        <input aria-label="Orders handled" type="number" min={0} className="field !min-h-10 w-40" placeholder="Orders handled" value={rep.orders} onChange={(e) => setRep({ ...rep, orders: e.target.value })} />
        <div><button type="button" disabled={pending || rep.summary.trim().length < 3} className="btn-primary !min-h-10 disabled:opacity-60" onClick={() => run(() => fileReportAction({ summary: rep.summary, blockers: rep.blockers, ordersHandled: rep.orders === "" ? null : Number(rep.orders) }), "Report saved.")}>{d.mine ? "Update report" : "File report"}</button></div>
      </section>

      {d.canSet && d.reports.map((day) => (
        <section key={day.day} className="card p-4 text-sm">
          <h2 className="font-semibold">{day.label}&apos;s daily reports</h2>
          <ul className="mt-2 space-y-2">
            {day.rows.map((r) => (
              <li key={r.staffId}><b>{r.name}</b> <span className="text-text2">· {r.role}</span> · {r.filed
                ? <>{r.summary}{r.ordersHandled !== null ? ` (${r.ordersHandled} orders)` : ""}{r.blockers ? <span className="text-warning"> Blocker: {r.blockers}</span> : null}</>
                : <Pill tone="bad">Missing</Pill>}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
