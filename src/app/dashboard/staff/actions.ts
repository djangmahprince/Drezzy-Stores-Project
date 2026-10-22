"use server";

import { requireStaff } from "@/lib/auth";
import { metricLabels } from "@/lib/team/pace";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TeamResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): TeamResult => ({ ok: false, error });
const refused: TeamResult = { ok: false, error: "You cannot do that, or something went wrong. Please try again." };

export async function setTargetAction(t: { staffId: string | null; metric: string; goal: number; from: string; to: string; note?: string }): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "targets_set", "create")) return fail("You cannot set targets.");
  if (!isSupabaseConfigured) return fail("Connect Supabase first.");
  if (!(t.metric in metricLabels)) return fail("Choose what to measure.");
  if (!Number.isFinite(t.goal) || t.goal <= 0) return fail("Enter a goal above zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.from) || !/^\d{4}-\d{2}-\d{2}$/.test(t.to) || t.to < t.from) return fail("Choose a start date and an end date after it.");
  const { error } = await (await createClient()).from("targets").insert({
    staff_id: t.staffId || null, metric: t.metric, goal: t.goal, period_start: t.from, period_end: t.to, note: t.note?.trim().slice(0, 200) || null, set_by: me.id,
  });
  return error ? (error.code === "23514" ? fail("The period can be at most 400 days.") : refused) : { ok: true };
}

export async function deleteTargetAction(id: string): Promise<TeamResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "targets_set", "delete")) return fail("You cannot remove targets.");
  const { error } = await (await createClient()).from("targets").delete().eq("id", id);
  return error ? refused : { ok: true };
}

/** Today's report for the signed-in person. Filing again updates it. */
export async function fileReportAction(r: { summary: string; blockers: string; ordersHandled: number | null }): Promise<TeamResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return fail("Connect Supabase first.");
  const summary = r.summary.trim();
  if (summary.length < 3) return fail("Write a short summary of your day.");
  if (summary.length > 2000 || r.blockers.length > 1000) return fail("That is too long. Keep the summary under 2,000 characters and blockers under 1,000.");
  if (r.ordersHandled !== null && (!Number.isInteger(r.ordersHandled) || r.ordersHandled < 0 || r.ordersHandled > 1000)) return fail("Orders handled must be a whole number.");
  const { error } = await (await createClient()).from("daily_reports").upsert(
    { staff_id: me.id, report_date: new Date().toISOString().slice(0, 10), summary, blockers: r.blockers.trim() || null, orders_handled: r.ordersHandled },
    { onConflict: "staff_id,report_date" },
  );
  return error ? refused : { ok: true };
}
