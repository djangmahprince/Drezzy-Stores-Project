import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type TargetRow = { id: string; staffId: string | null; staff: string; metric: string; goal: number; actual: number; from: string; to: string; note: string | null; elapsed: number };
export type ReportRow = { staffId: string; name: string; role: string; filed: boolean; summary: string | null; blockers: string | null; ordersHandled: number | null };
export type TeamData = {
  canSet: boolean;
  today: string;
  targets: TargetRow[];
  /** Everyone's report for today and yesterday. Managers only; empty for everyone else. */
  reports: { day: string; label: string; rows: ReportRow[] }[];
  mine: { summary: string; blockers: string; ordersHandled: number | null } | null;
  people: { id: string; name: string; role: string }[];
};

type ProgressJson = { id: string; staff_id: string | null; staff: string; metric: string; goal: number | string; actual: number | string; from: string; to: string; note: string | null; elapsed: number | string };
type StatusJson = { staff_id: string; name: string; role: string; filed: boolean; summary: string | null; blockers: string | null; orders_handled: number | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getTeam(): Promise<TeamData> {
  const me = await requireStaff();
  await connection(); // dates below depend on when the request is made
  const supabase = await createClient();
  const canSet = can(me.permissions, "targets_set", "view");
  const now = new Date();
  const today = iso(now);
  const yesterday = iso(new Date(now.getTime() - 86_400_000));

  const [prog, mineRes, todayRep, yRep, ppl] = await Promise.all([
    supabase.rpc("target_progress", { p_date: today }),
    supabase.from("daily_reports").select("summary, blockers, orders_handled").eq("staff_id", me.id).eq("report_date", today).maybeSingle(),
    canSet ? supabase.rpc("report_status", { p_date: today }) : Promise.resolve({ data: [] }),
    canSet ? supabase.rpc("report_status", { p_date: yesterday }) : Promise.resolve({ data: [] }),
    canSet ? supabase.from("staff").select("id, full_name, role:roles(name)").eq("active", true).order("full_name") : Promise.resolve({ data: [] }),
  ]);

  const rows = (d: unknown) => ((d ?? []) as StatusJson[]).map((s) => ({ staffId: s.staff_id, name: s.name, role: s.role, filed: s.filed, summary: s.summary, blockers: s.blockers, ordersHandled: s.orders_handled }));
  const mine = mineRes.data as { summary: string; blockers: string | null; orders_handled: number | null } | null;
  return {
    canSet,
    today,
    targets: ((prog.data ?? []) as ProgressJson[]).map((t) => ({
      id: t.id, staffId: t.staff_id, staff: t.staff, metric: t.metric, goal: Number(t.goal), actual: Number(t.actual), from: t.from, to: t.to, note: t.note, elapsed: Number(t.elapsed),
    })),
    reports: [{ day: today, label: "Today", rows: rows(todayRep.data) }, { day: yesterday, label: "Yesterday", rows: rows(yRep.data) }],
    mine: mine ? { summary: mine.summary, blockers: mine.blockers ?? "", ordersHandled: mine.orders_handled } : null,
    people: ((ppl.data ?? []) as unknown as { id: string; full_name: string; role: { name: string } | { name: string }[] | null }[]).map((p) => ({ id: p.id, name: p.full_name, role: (Array.isArray(p.role) ? p.role[0]?.name : p.role?.name) ?? "" })),
  };
}
