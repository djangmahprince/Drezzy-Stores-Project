"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { adjustTargetAction, deleteTargetAction, fileReportAction, savePlanAction, setTargetAction, starterTargetsAction, type TeamResult } from "@/app/dashboard/staff/actions";
import { Kpi, Pill, Progress } from "@/components/dashboard/DashShell";
import { formatMetric, metricLabels, paceOf } from "@/lib/team/pace";
import type { TeamData } from "@/lib/team/staff";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

export function TeamLive({ d }: { d: TeamData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [rep, setRep] = useState({ summary: d.mine?.summary ?? "", blockers: d.mine?.blockers ?? "", orders: d.mine?.ordersHandled?.toString() ?? "" });
  const [t, setT] = useState({ owner: "person", staff: "", role: "", branch: "accra", team: "", metric: "paid_sales", goal: "", from: d.today, to: addDays(d.today, 6), note: "", weight: "1", label: "" });
  const [plan, setPlan] = useState<string[]>(() => [...(d.myDay?.plan ?? []), "", "", ""].slice(0, Math.max(3, (d.myDay?.plan ?? []).length)));
  const [checkins, setCheckins] = useState<Record<string, string>>(Object.fromEntries((d.myDay?.labels ?? []).map((l) => [l, String(d.myDay?.report?.checkins?.[l] ?? "")])));
  const [salesGoal, setSalesGoal] = useState("");

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

      <section className="card grid gap-4 p-4 text-sm md:grid-cols-2">
        <div>
          <h2 className="font-semibold">Today&apos;s plan</h2>
          <p className="text-xs text-text2">Your 3 to 5 priorities.{d.myDay?.yesterday ? ` Yesterday: ${d.myDay.yesterday.summary.slice(0, 90)}` : ""}</p>
          <div className="mt-2 space-y-1">{plan.map((l, i) => <input key={i} className="field !min-h-9" value={l} aria-label={`Priority ${i + 1}`} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? e.target.value : x)))} />)}</div>
          <div className="mt-2 flex gap-2">
            {plan.length < 5 && <button type="button" className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => setPlan([...plan, ""])}>Add a line</button>}
            <button type="button" disabled={pending} className="btn-primary !min-h-9 !px-3 text-sm" onClick={() => run(() => savePlanAction(plan), "Plan saved.")}>Save plan</button>
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Open tasks</h2>
          <ul className="mt-2 space-y-1">
            <li>{d.myDay?.open_tasks.to_confirm ?? 0} orders to confirm</li>
            <li>{d.myDay?.open_tasks.to_source ?? 0} supplier orders to place</li>
            <li>{d.myDay?.open_tasks.to_pack ?? 0} orders to pack or dispatch</li>
            <li>{d.myDay?.open_tasks.unread ?? 0} unread alerts</li>
          </ul>
          <Link href={`/dashboard/staff/${d.meId}`} className="mt-2 inline-block font-semibold text-navy underline">My scorecard and weekly summary</Link>
        </div>
      </section>

      {d.leaderboards.filter((l) => l.rows.length).map((l) => (
        <section key={l.role} className="card p-4 text-sm">
          <h2 className="font-semibold capitalize">{l.name} leaderboard this week</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">{l.rows.map((r) => <li key={r.name}>{r.name}: <b>{r.value}</b></li>)}</ol>
        </section>
      ))}

      <section className="card divide-y divide-line" aria-label="Targets">
        {scored.length === 0 && <p className="p-4 text-sm text-text2">No targets yet.{d.canSet ? " Set one below." : " Your manager has not set one for this period."}</p>}
        {scored.map((x) => (
          <div key={x.id} className="grid items-center gap-2 p-4 text-sm md:grid-cols-[1.2fr_1.2fr_1.6fr_auto]">
            <b>{x.staffId && d.canSet ? <Link href={`/dashboard/staff/${x.staffId}`} className="text-navy underline">{x.staff}</Link> : x.staff}{x.status !== "active" && <span className="chip ml-1 bg-card text-text2">{x.status}</span>}</b>
            <span className="text-text2">{x.label ?? metricLabels[x.metric]?.name ?? x.metric}: {formatMetric(x.metric, x.goal)}{x.weight !== 1 ? ` · weight ${x.weight}` : ""}<br /><span className="text-xs">{x.from} to {x.to}{x.note ? ` · ${x.note}` : ""}</span></span>
            <div><p>{formatMetric(x.metric, x.actual)} · {x.pace.pct}%</p><Progress pct={x.pace.pct} tone={x.pace.tone} /></div>
            <span className="flex items-center gap-2"><Pill tone={x.pace.tone}>{x.pace.label}</Pill>
              {d.canSet && <button type="button" disabled={pending} className="text-xs text-navy underline" onClick={() => {
                const goal = window.prompt("New goal (leave as it is to keep it)", String(x.goal));
                if (goal === null) return;
                const reason = window.prompt("Why are you changing it? (kept in the log)") ?? "";
                run(() => adjustTargetAction(x.id, { goal: Number(goal) }, reason), "Target changed.");
              }}>Adjust</button>}
              {d.canSet && <button type="button" disabled={pending} className="text-xs text-navy underline" onClick={() => {
                const reason = window.prompt(x.status === "paused" ? "Why resume it?" : "Why pause it?") ?? "";
                run(() => adjustTargetAction(x.id, { status: x.status === "paused" ? "active" : "paused" }, reason), "Saved.");
              }}>{x.status === "paused" ? "Resume" : "Pause"}</button>}
              {d.canSet && x.status !== "closed" && <button type="button" disabled={pending} className="text-xs text-navy underline" onClick={() => { const reason = window.prompt("Why close it?") ?? ""; run(() => adjustTargetAction(x.id, { status: "closed" }, reason), "Closed."); }}>Close</button>}
              {d.canSet && <button type="button" disabled={pending} aria-label={`Remove target for ${x.staff}`} className="text-xs text-error underline" onClick={() => { if (window.confirm("Remove this target?")) run(() => deleteTargetAction(x.id), "Target removed."); }}>Remove</button>}
            </span>
          </div>
        ))}
      </section>

      {d.canSet && (
        <section className="card space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Set a target</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <select aria-label="Target for" className="field !min-h-10" value={t.owner} onChange={(e) => setT({ ...t, owner: e.target.value })}>
              <option value="person">A person</option><option value="role">A role</option><option value="team">A team</option><option value="branch">A branch</option><option value="everyone">Everyone</option>
            </select>
            {t.owner === "person" && <select aria-label="Who" className="field !min-h-10" value={t.staff} onChange={(e) => setT({ ...t, staff: e.target.value })}><option value="">Choose a person</option>{d.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select>}
            {t.owner === "role" && <select aria-label="Role" className="field !min-h-10" value={t.role} onChange={(e) => setT({ ...t, role: e.target.value })}><option value="">Choose a role</option>{d.roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}
            {t.owner === "team" && <input aria-label="Team name" className="field !min-h-10" placeholder="Team name" value={t.team} onChange={(e) => setT({ ...t, team: e.target.value })} />}
            {t.owner === "branch" && <select aria-label="Branch" className="field !min-h-10" value={t.branch} onChange={(e) => setT({ ...t, branch: e.target.value })}><option value="accra">Accra</option><option value="kumasi">Kumasi</option></select>}
            <select aria-label="Measure" className="field !min-h-10" value={t.metric} onChange={(e) => setT({ ...t, metric: e.target.value })}>
              {Object.entries(metricLabels).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
            <input aria-label="Goal" type="number" min={1} placeholder={metricLabels[t.metric].unit === "GHS" ? "Goal (GHS)" : metricLabels[t.metric].unit === "percent" ? "Goal (%)" : "Goal (number)"} className="field !min-h-10" value={t.goal} onChange={(e) => setT({ ...t, goal: e.target.value })} />
            {t.metric === "check_in" && <input aria-label="Check-in name" className="field !min-h-10" placeholder="What is counted, for example Social posts" value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} />}
            <input aria-label="Weight" type="number" min={0.1} step={0.1} className="field !min-h-10" placeholder="Weight (scorecard)" value={t.weight} onChange={(e) => setT({ ...t, weight: e.target.value })} />
            <label className="grid gap-1 text-xs text-text2">From<input type="date" className="field !min-h-10" value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-text2">To<input type="date" className="field !min-h-10" value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-text2">Note (optional)<input className="field !min-h-10" maxLength={200} value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></label>
          </div>
          <p className="text-xs text-text2">Progress is counted from real orders, supplier orders and reports. Nobody types in their own numbers.</p>
          <button type="button" disabled={pending || !t.goal} className="btn-primary !min-h-10 disabled:opacity-60" onClick={() => run(() => setTargetAction({ staffId: t.staff || null, ownerKind: t.owner, roleKey: t.role, branch: t.branch, team: t.team, metric: t.metric, goal: Number(t.goal), from: t.from, to: t.to, note: t.note, weight: Number(t.weight), label: t.label }), "Target set.", () => setT({ ...t, goal: "", note: "" }))}>Set target</button>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="font-medium">Starter targets for this week:</span>
            <input aria-label="Weekly sales goal per agent" type="number" min={1} className="field !min-h-10 w-52" placeholder="Sales goal per agent (GHS)" value={salesGoal} onChange={(e) => setSalesGoal(e.target.value)} />
            <button type="button" disabled={pending || !salesGoal} className="btn-outline !min-h-10" onClick={() => start(async () => { const r = await starterTargetsAction(d.weekStart, Number(salesGoal)); setMsg(r.ok ? { text: `${r.n} starter targets set.`, bad: false } : { text: r.error, bad: true }); router.refresh(); })}>Load the starter targets</button>
          </div>
        </section>
      )}

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Your report for today {d.mine && <Pill tone="ok">Filed</Pill>}</h2>
        <textarea aria-label="What did you do today" className="field min-h-24" maxLength={2000} placeholder="What you got done today" value={rep.summary} onChange={(e) => setRep({ ...rep, summary: e.target.value })} />
        <textarea aria-label="Anything blocking you" className="field min-h-16" maxLength={1000} placeholder="Anything blocking you? (optional)" value={rep.blockers} onChange={(e) => setRep({ ...rep, blockers: e.target.value })} />
        <input aria-label="Orders handled" type="number" min={0} className="field !min-h-10 w-40" placeholder="Orders handled" value={rep.orders} onChange={(e) => setRep({ ...rep, orders: e.target.value })} />
        {(d.myDay?.labels ?? []).map((l) => <label key={l} className="flex items-center gap-2">{l}<input type="number" min={0} className="field !min-h-10 w-28" value={checkins[l] ?? ""} onChange={(e) => setCheckins({ ...checkins, [l]: e.target.value })} /></label>)}
        <p className="text-xs text-text2">Orders, sales, supplier orders and deliveries are added from the system when you file.</p>
        <div><button type="button" disabled={pending || rep.summary.trim().length < 3} className="btn-primary !min-h-10 disabled:opacity-60" onClick={() => run(() => fileReportAction({ summary: rep.summary, blockers: rep.blockers, ordersHandled: rep.orders === "" ? null : Number(rep.orders), checkins: Object.fromEntries(Object.entries(checkins).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }), "Report saved.")}>{d.mine ? "Update report" : "File report"}</button></div>
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
