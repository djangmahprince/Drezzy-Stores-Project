"use server";

import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type ExpenseState = { error?: string; ok?: boolean };

const CATS = ["supplier_costs", "delivery_and_riders", "ads_and_promotion", "rent_and_utilities", "packaging", "other"];

/** Records an expense with the person's own session, so row-level security applies the role's category limit. */
export async function addExpenseAction(_prev: ExpenseState, fd: FormData): Promise<ExpenseState> {
  const me = await requireStaff();
  if (!can(me.permissions, "expenses", "create")) return { error: "You cannot record expenses." };

  const category = String(fd.get("category") ?? "");
  const amount = Number(fd.get("amount"));
  const date = String(fd.get("date") ?? "");
  const method = String(fd.get("method") ?? "cash");
  const branch = String(fd.get("branch") ?? "both");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);

  if (!CATS.includes(category)) return { error: "Choose a category." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose the date." };
  if (!["cash", "momo", "card", "bank"].includes(method)) return { error: "Choose how it was paid." };
  if (!["accra", "kumasi", "both"].includes(branch)) return { error: "Choose a branch." };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    category, amount, spent_on: date, method, branch, note: note || null, created_by: me.id, created_by_name: me.fullName,
  });
  if (error) return { error: "That was not allowed. Your role may only record certain kinds of expense." };
  return { ok: true };
}
