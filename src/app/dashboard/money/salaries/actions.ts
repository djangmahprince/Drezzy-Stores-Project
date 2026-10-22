"use server";

import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SalaryResult = { ok: true } | { ok: false; error: string };
const refused: SalaryResult = { ok: false, error: "You cannot do that, or something went wrong. Please try again." };
const monthOk = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export async function saveSalaryAction(a: { staffId: string; month: string; amount: number; note?: string }): Promise<SalaryResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "salary", "create")) return { ok: false, error: "You cannot record salaries." };
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  if (!monthOk(a.month)) return { ok: false, error: "Choose a month." };
  if (!Number.isFinite(a.amount) || a.amount <= 0) return { ok: false, error: "Enter an amount above zero." };
  const supabase = await createClient();
  const row = { staff_id: a.staffId, month: `${a.month}-01`, amount: Math.round(a.amount * 100) / 100, note: a.note?.trim().slice(0, 300) || null };
  const { data: existing } = await supabase.from("salary_records").select("id, status").eq("staff_id", a.staffId).eq("month", row.month).maybeSingle();
  if (existing?.status === "paid") return { ok: false, error: "That salary is already paid and cannot be changed." };
  const { error } = existing
    ? await supabase.from("salary_records").update({ amount: row.amount, note: row.note }).eq("id", existing.id)
    : await supabase.from("salary_records").insert({ ...row, created_by: me.id });
  return error ? refused : { ok: true };
}

export async function markSalaryPaidAction(id: string, method: "cash" | "momo" | "bank"): Promise<SalaryResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "salary", "edit")) return { ok: false, error: "You cannot record salary payments." };
  if (!["cash", "momo", "bank"].includes(method)) return { ok: false, error: "Choose how it was paid." };
  const { error } = await (await createClient()).from("salary_records").update({ status: "paid", paid_on: new Date().toISOString().slice(0, 10), method }).eq("id", id).eq("status", "due");
  return error ? refused : { ok: true };
}
