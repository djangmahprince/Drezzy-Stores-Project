"use server";

import { getStaffState } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Customer records (PRD section 17). Every write is a database function that checks the caller's rights itself. */
export type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const friendly = (m?: string) => (m && m.length < 160 && !/violates|constraint|function |relation|syntax/i.test(m) ? m : "That did not work. Please try again.");

async function db() {
  if (!isSupabaseConfigured) throw new Error("Connect Supabase first.");
  const s = await getStaffState();
  if (s.status !== "ok") throw new Error("Sign in first.");
  return createClient();
}

async function call<T = undefined>(fn: string, args: Record<string, unknown>): Promise<R<T>> {
  try {
    const { data, error } = await (await db()).rpc(fn, args);
    return error ? { ok: false, error: friendly(error.message) } : { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export type DirRow = { id: string; name: string; phone: string | null; email: string | null; region: string | null; source: string | null; tags: string[]; consent: boolean; has_account: boolean; orders: number; spend: number | null; last_order: string | null; balance: number; since: string };

export async function directoryAction(p: Record<string, string | number | boolean>): Promise<R<{ total: number; rows: DirRow[] }>> {
  return call("customer_directory", { p });
}
export async function updateCustomerAction(id: string, p: Record<string, unknown>): Promise<R> {
  return call("update_customer", { p_id: id, p });
}
export async function mergeCustomersAction(keep: string, merge: string, reason: string): Promise<R> {
  return call("merge_customers", { p_keep: keep, p_merge: merge, p_reason: reason });
}
export async function importCustomersAction(rows: Record<string, string>[]): Promise<R<{ created: number; updated: number; errors: { row: number; problem: string }[] }>> {
  return call("import_customers", { p_rows: rows });
}
export async function eraseCustomerAction(id: string, request?: string): Promise<R> {
  return call("erase_customer", { p_id: id, p_request: request ?? null });
}

export async function handleRequestAction(id: string, status: "done" | "refused", response: string): Promise<R> {
  try {
    const supabase = await db();
    const s = await getStaffState();
    const name = s.status === "ok" ? s.staff.fullName : null;
    const { data, error } = await supabase.from("data_requests").update({ status, response: response.trim().slice(0, 1000) || null, handled_at: new Date().toISOString(), handled_by_name: name, handled_by: s.status === "ok" ? s.staff.id : null }).eq("id", id).select("id");
    return error || !data?.length ? { ok: false, error: "You cannot handle data requests." } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function closeThreadAction(id: string): Promise<R> {
  return call("support_reply", { p_thread: id, p_body: "", p_close: true });
}
