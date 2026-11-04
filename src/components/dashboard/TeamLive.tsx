"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { adjustTargetAction, deleteTargetAction, fileReportAction, savePlanAction, setTargetAction, starterTargetsAction, type TeamResult } from "@/app/dashboard/staff/actions";
import { Avatar, Kpi, PageHead, Pill, Progress, Segmented } from "@/components/dashboard/DashShell";
import { formatMetric, metricLabels, paceOf } from "@/lib/team/pace";
import type { TeamData } from "@/lib/team/staff";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

const periods = [["today", "Today"], ["week", "This week"], ["month", "This month"]] as const;
type Span = (typeof periods)[number][0];
const spanOf = (from: string, to: string): Span => { const n = (Date.parse(to) - Date.parse(from)) / 86_400_000; return n < 1 ? "today" : n <= 7 ? "week" : "month"; };
const titles: Record<Span, string> = { today: "Today's targets", week: "This week's targets", month: "This month's targets" };

export function TeamLive({ d, real = true }: { d: TeamData; real?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [rep, setRep] = useState({ summary: d.mine?.summary ?? "", blockers: d.mine?.blockers ?? "", orders: d.mine?.ordersHandled?.toString() ?? "" });
  const [t, setT] = useState({ owner: "person", staff: "", role: "", branch: "accra", team: "", metric: "paid_sales", goal: "", from: d.today, to: addDays(d.today, 6), note: "", weight: "1", label: "" });
  const [plan, setPlan] = useState<string[]>(() => [...(d.myDay?.plan ?? []), "", "", ""].slice(0, Math.max(3, (d.myDay?.plan ?? []).length)));
  const [checkins, setCheckins] = useState<Record<string, string>>(Object.fromEntries((d.myDay?.labels ?? []).map((l) => [l, String(d.myDay?.report?.checkins?.[l] ?? "")])));
  const [salesGoal, setSalesGoal] = useState("");
  const [span, setSpan] = useState<Span>("week");
  const [length, setLength] = useState("weekly");
  const pickLength = (v: string) => {
    setLength(v);
    if (v === "daily") setT((x) => ({ ...x, from: d.today, to: d.today }));
    if (v === "weekly") setT((x) => ({ ...x, from: d.weekStart, to: addDays(d.weekStart, 6) }));
    if (v === "monthly") setT((x) => { const first = `${d.today.slice(0, 7)}-01`; const end = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).toISOString().slice(0, 10); return { ...x, from: first, to: end }; });
  };

  function run(fn: () => Promise<TeamResult>, ok: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { text: ok, bad: false } : { text: res.error, bad: true });
      if (res.ok) { after?.(); router.refresh(); }
    });
  }

  const scored = d.targets.map((x) => ({ ...x, pace: paceOf(x.actual, x.goal, x.elapsed) }));
  const shown = scored.filter((x) => spanOf(x.from, x.to) === span);
  const onTrack = shown.filter((x) => x.pace.tone === "ok").length;
  const sales = scored.filter((x) => x.metric === "paid_sales" && x.status === "active" && spanOf(x.from, x.to) === "week");
  const salesGoalTotal = sales.reduce((s, x) => s + x.goal, 0);
  const salesActual = sales.reduce((s, x) => s + x.actual, 0);
  const yesterday = d.reports[1];
  const missing = yesterday?.rows.filter((r) => !r.filed).length ?? 0;
  const roleOf = (id: string | null) => (id ? d.people.find((p) => p.id === id)?.role : undefined);

  return (
    <div className="space-y-4">
      <PageHead real={real} title="Staff and targets" sub="Progress is counted from real orders, supplier orders and deliveries. Daily reports fill the gaps."
        actions={<><Segmented options={periods} value={span} onChange={setSpan} label="Period" /><a href="/api/export?kind=targets&format=xlsx" className="btn-outline !min-h-11">Export</a></>} />
      {msg && <p role="status" className={`rounded-[12px] p-3 text-sm ${msg.bad ? "bg-[#fdecec] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Targets on pace or hit" value={shown.length ? `${onTrack} of ${shown.length}` : "None set"} note={shown.length ? `${shown.length - onTrack} need a check-in` : undefined} />
        {d.canSet && <Kpi label="Daily reports this week" value={`${d.week.filed} of ${d.week.expected}`} note={missing ? `${missing} missing yesterday` : "None missing yesterday"} noteTone={missing ? "warn" : undefined} />}
        {d.canSet && <Kpi label="Team sales vs weekly target" value={salesGoalTotal ? `${Math.round((salesActual / salesGoalTotal) * 100)}%` : "No target"} note={salesGoalTotal ? `GHS ${salesActual.toLocaleString("en-GH")} of GHS ${salesGoalTotal.toLocaleString("en-GH")}` : undefined} />}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
          <section className="card min-w-0 p-4 text-sm" aria-label="Targets">
            <h2 className="text-base font-semibold">{titles[span]}</h2>
            {shown.length === 0 ? <p className="mt-3 text-text2">No targets for this period.{d.canSet ? " Set one here." : " Your manager has not set one."}</p> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left">
                  <thead className="border-b border-line text-text2"><tr>{["Person", "Target", "Progress", "Pace", "Reports", ""].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((x) => {
                      const dots = x.staffId ? d.dots[x.staffId] : undefined;
                      return (
                        <tr key={x.id} className={`border-b border-line last:border-0 ${x.pace.tone !== "ok" ? "bg-[#fffaf0]" : ""}`}>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2.5"><Avatar name={x.staff} tone={x.staffId ? "navy" : "grey"} />
                              <span className="min-w-0 leading-tight">{x.staffId && d.canSet ? <Link href={`/dashboard/staff/${x.staffId}`} className="font-semibold text-ink hover:underline">{x.staff}</Link> : <b>{x.staff}</b>}<span className="block text-xs text-text2">{roleOf(x.staffId) ?? "Team"}</span></span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">{x.label ?? metricLabels[x.metric]?.name ?? x.metric} {formatMetric(x.metric, x.goal)}{x.status !== "active" && <span className="chip ml-1 bg-card text-text2">{x.status}</span>}</td>
                          <td className="w-44 py-2.5 pr-4"><Progress pct={x.pace.pct} tone={x.pace.tone} /><p className="mt-1 text-xs text-text2">{formatMetric(x.metric, x.actual)} · {x.pace.pct}%</p></td>
                          <td className="py-2.5 pr-4">{x.pace.label === "Hit" ? <span className="chip bg-navy text-lime">Hit</span> : <Pill tone={x.pace.tone}>{x.pace.label}</Pill>}</td>
                          <td className="py-2.5 pr-4">{dots ? <span className="flex gap-1" role="img" aria-label={`${dots.filter(Boolean).length} of ${dots.length} reports filed`}>{dots.map((f, i) => <span key={i} className={`size-2.5 rounded-full ${f ? "bg-success" : "bg-line"}`} />)}</span> : <span className="text-xs text-text2">Not required</span>}</td>
                          <td className="py-2.5 text-right">
                            {d.canSet && (
                              <details className="relative">
                                <summary className="cursor-pointer list-none px-1 text-lg leading-none text-text2" aria-label={`Change target for ${x.staff}`}>⋯</summary>
                                <div className="absolute right-0 z-20 mt-1 flex w-28 flex-col rounded-[10px] border border-line bg-white p-1 text-left text-xs shadow-lg">
                                  <button type="button" disabled={pending} className="rounded px-2 py-1.5 text-left hover:bg-card" onClick={() => { const goal = window.prompt("New goal (leave as it is to keep it)", String(x.goal)); if (goal === null) return; const reason = window.prompt("Why are you changing it? (kept in the log)") ?? ""; run(() => adjustTargetAction(x.id, { goal: Number(goal) }, reason), "Target changed."); }}>Adjust</button>
                                  <button type="button" disabled={pending} className="rounded px-2 py-1.5 text-left hover:bg-card" onClick={() => { const reason = window.prompt(x.status === "paused" ? "Why resume it?" : "Why pause it?") ?? ""; run(() => adjustTargetAction(x.id, { status: x.status === "paused" ? "active" : "paused" }, reason), "Saved."); }}>{x.status === "paused" ? "Resume" : "Pause"}</button>
                                  {x.status !== "closed" && <button type="button" disabled={pending} className="rounded px-2 py-1.5 text-left hover:bg-card" onClick={() => { const reason = window.prompt("Why close it?") ?? ""; run(() => adjustTargetAction(x.id, { status: "closed" }, reason), "Closed."); }}>Close</button>}
                                  <button type="button" disabled={pending} className="rounded px-2 py-1.5 text-left text-error hover:bg-card" onClick={() => { if (window.confirm("Remove this target?")) run(() => deleteTargetAction(x.id), "Target removed."); }}>Remove</button>
                                </div>
                              </details>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

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

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Your report for today {d.mine && <Pill tone="ok">Filed</Pill>}</h2>
        <textarea aria-label="What did you do today" className="field min-h-24" maxLength={2000} placeholder="What you got done today" value={rep.summary} onChange={(e) => setRep({ ...rep, summary: e.target.value })} />
        <textarea aria-label="Anything blocking you" className="field min-h-16" maxLength={1000} placeholder="Anything blocking you? (optional)" value={rep.blockers} onChange={(e) => setRep({ ...rep, blockers: e.target.value })} />
        <input aria-label="Orders handled" type="number" min={0} className="field !min-h-10 w-40" placeholder="Orders handled" value={rep.orders} onChange={(e) => setRep({ ...rep, orders: e.target.value })} />
        {(d.myDay?.labels ?? []).map((l) => <label key={l} className="flex items-center gap-2">{l}<input type="number" min={0} className="field !min-h-10 w-28" value={checkins[l] ?? ""} onChange={(e) => setCheckins({ ...checkins, [l]: e.target.value })} /></label>)}
        <p className="text-xs text-text2">Orders, sales, supplier orders and deliveries are added from the system when you file.</p>
        <div><button type="button" disabled={pending || rep.summary.trim().length < 3} className="btn-primary !min-h-10 disabled:opacity-60" onClick={() => run(() => fileReportAction({ summary: rep.summary, blockers: rep.blockers, ordersHandled: rep.orders === "" ? null : Number(rep.orders), checkins: Object.fromEntries(Object.entries(checkins).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }), "Report saved.")}>{d.mine ? "Update report" : "File report"}</button></div>
      </section>

        </div>

        <div className="space-y-4">
          {d.canSet && (
            <section className="card space-y-3 p-4 text-sm">
              <h2 className="text-base font-semibold">Set a target</h2>
              <div className="grid gap-2">
                <p className="font-medium">For</p>
            <select aria-label="Target for" className="field !min-h-10" value={t.owner} onChange={(e) => setT({ ...t, owner: e.target.value })}>
              <option value="person">A person</option><option value="role">A role</option><option value="team">A team</option><option value="branch">A branch</option><option value="everyone">Everyone</option>
            </select>
            {t.owner === "person" && <select aria-label="Who" className="field !min-h-10" value={t.staff} onChange={(e) => setT({ ...t, staff: e.target.value })}><option value="">Choose a person</option>{d.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select>}
            {t.owner === "role" && <select aria-label="Role" className="field !min-h-10" value={t.role} onChange={(e) => setT({ ...t, role: e.target.value })}><option value="">Choose a role</option>{d.roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}
            {t.owner === "team" && <input aria-label="Team name" className="field !min-h-10" placeholder="Team name" value={t.team} onChange={(e) => setT({ ...t, team: e.target.value })} />}
            {t.owner === "branch" && <select aria-label="Branch" className="field !min-h-10" value={t.branch} onChange={(e) => setT({ ...t, branch: e.target.value })}><option value="accra">Accra</option><option value="kumasi">Kumasi</option></select>}
                <p className="font-medium">Measure</p>
                <select aria-label="Measure" className="field !min-h-10" value={t.metric} onChange={(e) => setT({ ...t, metric: e.target.value })}>
                  {Object.entries(metricLabels).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
                {t.metric === "check_in" && <input aria-label="Check-in name" className="field !min-h-10" placeholder="What is counted, for example Social posts" value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} />}
                <div className="grid grid-cols-2 gap-2">
                  <label className="font-medium">Period
                    <select className="field mt-1 !min-h-10" value={length} onChange={(e) => pickLength(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom dates</option></select>
                  </label>
                  <label className="font-medium">Goal
                    <input aria-label="Goal" type="number" min={1} placeholder={metricLabels[t.metric].unit === "GHS" ? "GHS" : metricLabels[t.metric].unit === "percent" ? "%" : "Number"} className="field mt-1 !min-h-10" value={t.goal} onChange={(e) => setT({ ...t, goal: e.target.value })} />
                  </label>
                </div>
                {length === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-xs text-text2">From<input type="date" className="field !min-h-10" value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} /></label>
                    <label className="grid gap-1 text-xs text-text2">To<input type="date" className="field !min-h-10" value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} /></label>
                  </div>
                )}
                <label className="font-medium">Note to the staff member
                  <textarea className="field mt-1 min-h-16 py-2" maxLength={200} value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-xs text-text2">Weight on the scorecard<input aria-label="Weight" type="number" min={0.1} step={0.1} className="field !min-h-9 w-20" value={t.weight} onChange={(e) => setT({ ...t, weight: e.target.value })} /></label>
              </div>
<button type="button" disabled={pending || !t.goal} className="btn-primary !min-h-11 w-full disabled:opacity-60" onClick={() => run(() => setTargetAction({ staffId: t.staff || null, ownerKind: t.owner, roleKey: t.role, branch: t.branch, team: t.team, metric: t.metric, goal: Number(t.goal), from: t.from, to: t.to, note: t.note, weight: Number(t.weight), label: t.label }), "Target set.", () => setT({ ...t, goal: "", note: "" }))}>Set target</button>
              <p className="text-xs text-text2">They see it on their home screen. Every change is logged.</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="font-medium">Starter targets for this week:</span>
            <input aria-label="Weekly sales goal per agent" type="number" min={1} className="field !min-h-10 w-52" placeholder="Sales goal per agent (GHS)" value={salesGoal} onChange={(e) => setSalesGoal(e.target.value)} />
            <button type="button" disabled={pending || !salesGoal} className="btn-outline !min-h-10" onClick={() => start(async () => { const r = await starterTargetsAction(d.weekStart, Number(salesGoal)); setMsg(r.ok ? { text: `${r.n} starter targets set.`, bad: false } : { text: r.error, bad: true }); router.refresh(); })}>Load the starter targets</button>
          </div>
            </section>
          )}
          {d.canSet && yesterday && (
            <section className="card p-4 text-sm">
              <div className="flex items-baseline justify-between"><h2 className="text-base font-semibold">Yesterday&apos;s daily reports</h2><a href="#all-reports" className="font-semibold text-navy underline">All reports</a></div>
              {yesterday.rows.length === 0 ? <p className="mt-2 text-text2">Nothing yet.</p> : (
                <ul className="mt-3 space-y-2">
                  {yesterday.rows.slice(0, 6).map((r) => (
                    <li key={r.staffId} className={`rounded-[10px] p-3 ${r.filed ? "bg-card" : "bg-[#fbe4e4] text-error"}`}>
                      <p className="flex justify-between gap-2"><b>{r.name}</b><span className={r.filed ? "text-xs text-text2" : "text-xs"}>{r.filed ? "Filed" : "Missing"}</span></p>
                      <p className="mt-0.5">{r.filed ? `${r.summary ?? ""}${r.blockers ? ` Blocker: ${r.blockers}` : ""}` : "Admin was notified at the cut-off time."}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {d.canSet && (
        <section id="all-reports" className="card p-4 text-sm">
          <h2 className="text-base font-semibold">Today&apos;s daily reports</h2>
          <ul className="mt-2 space-y-2">
            {d.reports[0].rows.map((r) => (
              <li key={r.staffId}><b>{r.name}</b> <span className="text-text2">· {r.role}</span> · {r.filed
                ? <>{r.summary}{r.ordersHandled !== null ? ` (${r.ordersHandled} orders)` : ""}{r.blockers ? <span className="text-warning"> Blocker: {r.blockers}</span> : null}</>
                : <Pill tone="warn">Not yet</Pill>}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
