"use server";

import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type ExpenseState = { error?: string; ok?: boolean };

const CATS = ["supplier_costs", "delivery_and_riders", "ads_and_promotion", "rent_and_utilities", "utilities", "packaging", "data_and_airtime", "software_and_hosting", "other"];
const RECEIPTS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

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
  const id = crypto.randomUUID();
  const file = fd.get("receipt");
  let receipt: string | null = null;
  if (file instanceof File && file.size > 0) {
    const ext = RECEIPTS[file.type];
    if (!ext || file.size > 5 * 1024 * 1024) return { error: "Use a photo or PDF receipt up to 5 MB." };
    receipt = `expenses/${id}/receipt.${ext}`;
    const up = await supabase.storage.from("receipts").upload(receipt, file, { contentType: file.type });
    if (up.error) return { error: "Could not upload the receipt." };
  }
  const { error } = await supabase.from("expenses").insert({
    id, category, amount, spent_on: date, method, branch, note: note || null, created_by: me.id, created_by_name: me.fullName, receipt_path: receipt,
    campaign: String(fd.get("campaign") ?? "").trim().slice(0, 80) || null,
  });
  if (error) return { error: /closed/i.test(error.message) ? "That month is closed. Ask the Owner to unlock it first." : "That was not allowed. Your role may only record certain kinds of expense." };
  return { ok: true };
}

/** Other money in: owner top-ups and similar (FR-FIN-004). */
export async function addMoneyInAction(_prev: ExpenseState, fd: FormData): Promise<ExpenseState> {
  const me = await requireStaff();
  const amount = Number(fd.get("amount"));
  const reason = String(fd.get("reason") ?? "").trim();
  const date = String(fd.get("date") ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above zero." };
  if (reason.length < 3) return { error: "Say what this money is." };
  const { error } = await (await createClient()).from("money_in_entries").insert({
    amount, reason: reason.slice(0, 300), received_on: date, method: String(fd.get("method") ?? "momo"), branch: String(fd.get("branch") ?? "both"), created_by: me.id, created_by_name: me.fullName,
  });
  return error ? { error: /closed/i.test(error.message) ? "That month is closed." : "Your role cannot record money in." } : { ok: true };
}

export type MoneyResult = { ok: true } | { ok: false; error: string };
const rpcSay = (m: string) => (m.length < 120 && !/violates|function |relation/i.test(m) ? m : "That did not work.");

export async function closeMonthAction(month: string, note: string): Promise<MoneyResult> {
  await requireStaff();
  const { error } = await (await createClient()).rpc("close_month", { p_month: `${month}-01`, p_note: note });
  return error ? { ok: false, error: rpcSay(error.message) } : { ok: true };
}
export async function unlockMonthAction(month: string, reason: string): Promise<MoneyResult> {
  await requireStaff();
  const { error } = await (await createClient()).rpc("unlock_month", { p_month: `${month}-01`, p_reason: reason });
  return error ? { ok: false, error: rpcSay(error.message) } : { ok: true };
}
export async function handoverAction(riderId: string, day: string, amount: number, note: string): Promise<MoneyResult> {
  await requireStaff();
  const { error } = await (await createClient()).rpc("record_handover", { p_rider: riderId, p_day: day, p_amount: amount, p_note: note });
  return error ? { ok: false, error: rpcSay(error.message) } : { ok: true };
}
