"use server";

import { requireStaff } from "@/lib/auth";
import { metricLabels } from "@/lib/team/pace";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TeamResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): TeamResult => ({ ok: false, error });
const refused: TeamResult = { ok: false, error: "You cannot do that, or something went wrong. Please try again." };

export async function setTargetAction(t: { staffId: string | null; metric: string; goal: number; from: string; to: string; note?: string; ownerKind?: string; roleKey?: string; branch?: string; team?: string; weight?: number; label?: string }): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "targets_set", "create")) return fail("You cannot set targets.");
  if (!isSupabaseConfigured) return fail("Connect Supabase first.");
  if (!(t.metric in metricLabels)) return fail("Choose what to measure.");
  if (!Number.isFinite(t.goal) || t.goal <= 0) return fail("Enter a goal above zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.from) || !/^\d{4}-\d{2}-\d{2}$/.test(t.to) || t.to < t.from) return fail("Choose a start date and an end date after it.");
  if (t.metric === "check_in" && !t.label?.trim()) return fail("Name the check-in number, for example Social posts.");
  const kind = t.ownerKind ?? (t.staffId ? "person" : "everyone");
  const { error } = await (await createClient()).from("targets").insert({
    owner_kind: kind, staff_id: kind === "person" ? t.staffId || null : null, role_key: kind === "role" ? t.roleKey : null, branch: kind === "branch" ? t.branch : null, team: kind === "team" ? t.team?.trim() : null,
    metric: t.metric, goal: t.goal, period_start: t.from, period_end: t.to, note: t.note?.trim().slice(0, 200) || null, set_by: me.id,
    weight: t.weight && t.weight > 0 ? t.weight : 1, check_in_label: t.metric === "check_in" ? t.label!.trim().slice(0, 60) : null,
  });
  return error ? (error.code === "23514" ? fail("The period can be at most 400 days.") : refused) : { ok: true };
}

export async function deleteTargetAction(id: string): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "targets_set", "delete")) return fail("You cannot remove targets.");
  const { error } = await (await createClient()).from("targets").delete().eq("id", id);
  return error ? refused : { ok: true };
}

/** Pause, close or change a target with a reason that is logged (FR-TG-001). */
export async function adjustTargetAction(id: string, patch: { goal?: number; status?: string; to?: string }, reason: string): Promise<TeamResult> {
  await requireStaff();
  const { error } = await (await createClient()).rpc("adjust_target", { p_id: id, p: patch, p_reason: reason });
  return error ? fail(error.message.length < 120 ? error.message : "Could not change the target.") : { ok: true };
}

export async function starterTargetsAction(weekStart: string, salesGoal: number): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  await requireStaff();
  const { data, error } = await (await createClient()).rpc("apply_starter_targets", { p_week_start: weekStart, p_sales_goal: salesGoal });
  return error ? { ok: false, error: error.message.length < 120 ? error.message : "Could not set the starter targets." } : { ok: true, n: data as number };
}

/** The Daily Plan: today's priorities in 1 to 5 lines (PRD daily routine). */
export async function savePlanAction(lines: string[]): Promise<TeamResult> {
  const me = await requireStaff();
  const clean = lines.map((l) => l.trim().slice(0, 200)).filter(Boolean).slice(0, 5);
  if (!clean.length) return fail("Write at least one priority.");
  const { error } = await (await createClient()).from("daily_plans").upsert({ staff_id: me.id, plan_date: new Date().toISOString().slice(0, 10), lines: clean }, { onConflict: "staff_id,plan_date" });
  return error ? refused : { ok: true };
}

export async function commentWeekAction(staffId: string, weekStart: string, body: string): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "targets_set", "edit")) return fail("You cannot comment on this.");
  const text = body.trim().slice(0, 1000);
  if (!text) return fail("Write a comment.");
  const { error } = await (await createClient()).from("target_comments").insert({ staff_id: staffId, week_start: weekStart, author_id: me.id, author_name: me.fullName, body: text });
  return error ? refused : { ok: true };
}

export async function updateStaffRecordAction(id: string, p: { start_date: string | null; employment_status: string; team: string | null }): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "staff", "edit")) return fail("You cannot edit staff records.");
  const { error } = await (await createClient()).from("staff").update({ start_date: p.start_date || null, employment_status: p.employment_status, team: p.team?.trim() || null }).eq("id", id);
  return error ? refused : { ok: true };
}

/** Today's report for the signed-in person. Filing again updates it. The system adds its own numbers (FR-TG-003). */
export async function fileReportAction(r: { summary: string; blockers: string; ordersHandled: number | null; checkins?: Record<string, number> }): Promise<TeamResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return fail("Connect Supabase first.");
  const summary = r.summary.trim();
  if (summary.length < 3) return fail("Write a short summary of your day.");
  if (summary.length > 2000 || r.blockers.length > 1000) return fail("That is too long. Keep the summary under 2,000 characters and blockers under 1,000.");
  if (r.ordersHandled !== null && (!Number.isInteger(r.ordersHandled) || r.ordersHandled < 0 || r.ordersHandled > 1000)) return fail("Orders handled must be a whole number.");
  void me;
  const { error } = await (await createClient()).rpc("file_daily_report", { p: { summary, blockers: r.blockers, orders_handled: r.ordersHandled, checkins: r.checkins ?? {} } });
  return error ? refused : { ok: true };
}
