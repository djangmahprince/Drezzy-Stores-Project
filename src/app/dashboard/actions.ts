"use server";

import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { getStaffState } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Actions behind the dashboard frame: global search, the notifications bell, the branch filter and saved views. */

export type SearchHit = { kind: "order" | "customer" | "product" | "supplier"; label: string; sub: string; href: string };
export type Alert = { id: number; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

async function staffClient() {
  if (!isSupabaseConfigured) return null;
  const s = await getStaffState();
  if (s.status !== "ok") return null;
  return createClient();
}

/** Global search (PRD section 12): order number, phone, customer name, SKU, supplier or product, within what the role may see. */
export async function searchAction(q: string): Promise<SearchHit[]> {
  const supabase = await staffClient();
  if (!supabase || q.trim().length < 2) return [];
  const { data } = await supabase.rpc("staff_search", { p_q: q.trim().slice(0, 60) });
  return (data ?? []) as SearchHit[];
}

/** The in-app notification centre (FR-DB-006). */
export async function alertsAction(): Promise<{ unread: number; items: Alert[] }> {
  const supabase = await staffClient();
  if (!supabase) return { unread: 0, items: [] };
  const { data } = await supabase.from("staff_alerts").select("id, kind, title, body, link, created_at, read_at").order("created_at", { ascending: false }).limit(40);
  const items = (data ?? []) as Alert[];
  return { unread: items.filter((a) => !a.read_at).length, items };
}

export async function markAlertsReadAction(ids?: number[]): Promise<void> {
  const supabase = await staffClient();
  if (!supabase) return;
  let q = supabase.from("staff_alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  await q;
}

/** The branch switcher: a cookie that lists and reports read to show Accra, Kumasi or both. */
export async function setBranchAction(branch: "all" | "accra" | "kumasi"): Promise<void> {
  (await cookies()).set("drezzy_branch", branch, { path: "/dashboard", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
}

/** Records the device a staff member signed in from, so a sign-in from a new device raises an alert. */
export async function noteDeviceAction(): Promise<void> {
  const supabase = await staffClient();
  if (!supabase) return;
  const h = await headers();
  const ua = h.get("user-agent") ?? "unknown";
  const hash = createHash("sha256").update(ua).digest("hex").slice(0, 40);
  const label = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android phone" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows computer" : "Browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  await supabase.rpc("note_sign_in", { p_hash: hash, p_label: `${browser} on ${label}`.trim() });
}

export type SavedView = { id: string; name: string; params: Record<string, string> };

export async function savedViewsAction(list: string): Promise<SavedView[]> {
  const supabase = await staffClient();
  if (!supabase) return [];
  const { data } = await supabase.from("saved_views").select("id, name, params").eq("list", list).order("name");
  return (data ?? []) as SavedView[];
}

export async function saveViewAction(list: string, name: string, params: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const supabase = await staffClient();
  if (!supabase) return { ok: false, error: "Connect Supabase first." };
  const n = name.trim().slice(0, 40);
  if (!n) return { ok: false, error: "Name the view." };
  const s = await getStaffState();
  const { error } = await supabase.from("saved_views").upsert({ staff_id: s.status === "ok" ? s.staff.id : undefined, list, name: n, params }, { onConflict: "staff_id,list,name" });
  return error ? { ok: false, error: "Could not save the view." } : { ok: true };
}

export async function deleteViewAction(id: string): Promise<void> {
  const supabase = await staffClient();
  if (!supabase) return;
  await supabase.from("saved_views").delete().eq("id", id);
}
