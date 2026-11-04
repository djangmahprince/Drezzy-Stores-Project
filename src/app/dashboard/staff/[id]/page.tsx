import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Kpi, PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { StaffRecordForm, WeekComment } from "@/components/dashboard/StaffProfile";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { today } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { formatMetric, metricLabels } from "@/lib/team/pace";

type Week = {
  staff: string; score: number | null; previous: number | null; reports: number; working_days: number; report_completion: number | null; deliveries: number; on_time_rate: number | null;
  targets: { id: string; metric: string; label: string | null; goal: number; actual: number; weight: number; status: string }[];
  wins: unknown[]; misses: unknown[]; last_week_score: number | null; paid_sales: number; paid_sales_last_week: number; comments: { by: string; body: string; at: string }[];
};

/** Staff profile and scorecard (FR-DB-010, FR-TG-006, FR-TG-004). Pay details live in Money, hidden from everyone but Owner and Finance. */
async function Profile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ id }, { week }, me, t] = await Promise.all([params, searchParams, requireStaff(), today()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const manager = can(me.permissions, "targets_set", "view");
  if (id !== me.id && !manager) return <p className="card p-8 text-center text-text2">You can see your own scorecard only.</p>;
  const ws = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : t.weekStart;
  const supabase = await createClient();
  const [sum, rec, audit] = await Promise.all([
    supabase.rpc("weekly_summary", { p_staff: id, p_week_start: ws }),
    supabase.from("staff").select("full_name, email, phone, branch, start_date, employment_status, team, role:roles(name)").eq("id", id).maybeSingle(),
    can(me.permissions, "audit", "view") ? supabase.from("audit_log").select("at, action, table_name").eq("actor_id", id).order("at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
  ]);
  const w = sum.data as Week | null;
  const r = rec.data as { full_name: string; email: string; phone: string | null; branch: string; start_date: string | null; employment_status: string; team: string | null; role: { name: string } | { name: string }[] | null } | null;
  if (!w || !r) return <p className="card p-8 text-center text-text2">Not found.</p>;
  const role = Array.isArray(r.role) ? r.role[0]?.name : r.role?.name;
  const prevWeek = new Date(Date.parse(ws) - 7 * 86_400_000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.parse(ws) + 7 * 86_400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHead real title={r.full_name} sub={`${role ?? ""} · ${r.branch === "both" ? "Both branches" : r.branch}${r.team ? ` · ${r.team}` : ""}${r.start_date ? ` · since ${r.start_date}` : ""}`} />
      <div className="mb-3 flex items-center gap-2 text-sm">
        <a className="btn-outline !min-h-9" href={`?week=${prevWeek}`}>‹</a><span className="font-semibold">Week of {ws}</span><a className="btn-outline !min-h-9" href={`?week=${nextWeek}`}>›</a>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Scorecard" value={w.score === null ? "No targets" : `${w.score}%`} note={w.last_week_score !== null ? `Last week ${w.last_week_score}%` : "Weighted target attainment"} />
        <Kpi label="Daily reports" value={`${w.reports} of ${w.working_days}`} note={w.report_completion !== null ? `${w.report_completion}% complete` : undefined} />
        <Kpi label="Paid sales" value={`GHS ${Number(w.paid_sales).toLocaleString("en-GH")}`} note={`Last week GHS ${Number(w.paid_sales_last_week).toLocaleString("en-GH")}`} />
        <Kpi label="On-time deliveries" value={w.on_time_rate === null ? "None" : `${w.on_time_rate}%`} note={`${w.deliveries} delivered`} />
      </div>
      <h2 className="mb-2 mt-5 font-semibold">Targets this week · {w.wins.length} wins, {w.misses.length} misses</h2>
      {w.targets.length === 0 ? <p className="card p-6 text-sm text-text2">No targets for this week.</p> : (
        <Table head={["Target", "Goal", "Actual", "Weight", "Status"]} rows={w.targets.map((x) => [x.label ?? metricLabels[x.metric]?.name ?? x.metric, formatMetric(x.metric, Number(x.goal)), formatMetric(x.metric, Number(x.actual)), x.weight, <Pill key={x.id} tone={Number(x.actual) >= Number(x.goal) ? "ok" : "warn"}>{Number(x.actual) >= Number(x.goal) ? "Hit" : x.status}</Pill>])} />
      )}
      <section className="card mt-4 space-y-2 p-4 text-sm">
        <h2 className="font-semibold">Comments on this week</h2>
        {w.comments.length === 0 && <p className="text-text2">None yet.</p>}
        {w.comments.map((c, i) => <p key={i}><b>{c.by}:</b> {c.body}</p>)}
        {can(me.permissions, "targets_set", "edit") && <WeekComment staffId={id} week={ws} />}
      </section>
      {can(me.permissions, "staff", "edit") && <StaffRecordForm id={id} startDate={r.start_date} status={r.employment_status} team={r.team} />}
      {((audit.data ?? []) as { at: string; action: string; table_name: string }[]).length > 0 && (
        <section className="mt-4"><h2 className="mb-2 font-semibold">Recent activity</h2><Table head={["When", "What"]} rows={((audit.data ?? []) as { at: string; action: string; table_name: string }[]).map((a) => [new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), `${a.action.toLowerCase()} on ${a.table_name.replace(/_/g, " ")}`])} /></section>
      )}
    </>
  );
}

export default function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  return <Guard module={["targets_view", "targets_set", "staff"]}><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Profile params={params} searchParams={searchParams} /></Suspense></Guard>;
}
