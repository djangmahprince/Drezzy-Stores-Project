"use server";

import { updateTag } from "next/cache";
import { getStaffState } from "@/lib/auth";
import { CATALOGUE_TAG, REVIEWS_TAG, SITE_TAG } from "@/lib/catalogue/tags";
import { crudTables, type Field } from "@/lib/crud";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CrudResult = { ok: true } | { ok: false; error: string };
export type Row = Record<string, unknown>;

const tags = { site: SITE_TAG, catalogue: CATALOGUE_TAG, reviews: REVIEWS_TAG };

/** A value from the form, turned into what the column holds. Unknown columns never reach the database. */
function coerce(f: Field, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (f.type === "bool") return v === true || v === "true" || v === "on";
  if (v === null || v === "") return f.type === "list" ? [] : f.type === "json" ? (f.key === "items" ? [] : {}) : null;
  switch (f.type) {
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number`);
      return n;
    }
    case "list": return String(v).split(",").map((x) => x.trim()).filter(Boolean);
    case "json":
      if (typeof v === "object") return v;
      try {
        return JSON.parse(String(v));
      } catch {
        throw new Error(`${f.label} is not valid. Check the brackets and quotes.`);
      }
    case "datetime": return new Date(String(v)).toISOString();
    default: return String(v).trim();
  }
}

async function client() {
  if (!isSupabaseConfigured) throw new Error("Connect Supabase first.");
  const s = await getStaffState();
  if (s.status !== "ok") throw new Error("Sign in first.");
  return { supabase: await createClient(), staff: s.staff };
}

const say = (m: string) => (/violates|duplicate key/i.test(m) ? (/duplicate key/i.test(m) ? "That already exists." : "Some values are not allowed. Check the form.") : /row-level|permission/i.test(m) ? "Your role cannot change this." : m.slice(0, 160));

export async function crudListAction(name: string): Promise<{ rows: Row[]; error?: string }> {
  const def = crudTables[name];
  if (!def) return { rows: [], error: "Unknown list" };
  try {
    const { supabase } = await client();
    let q = supabase.from(def.table).select("*").limit(500);
    if (def.order) q = q.order(def.order, { ascending: def.order !== "created_at" });
    const { data, error } = await q;
    return error ? { rows: [], error: "You cannot see this list." } : { rows: (data ?? []) as Row[] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Could not load" };
  }
}

export async function crudSaveAction(name: string, key: string | null, values: Row): Promise<CrudResult> {
  const def = crudTables[name];
  if (!def) return { ok: false, error: "Unknown list" };
  try {
    const { supabase, staff } = await client();
    const row: Row = {};
    for (const f of def.fields) {
      if (!(f.key in values)) continue;
      const v = coerce(f, values[f.key]);
      if (v !== undefined) row[f.key] = v;
      if (f.required && (row[f.key] === null || row[f.key] === "")) return { ok: false, error: `${f.label} is required.` };
    }
    if (name === "coupons" && typeof row.code === "string") row.code = row.code.toUpperCase();
    if (name === "coupons" && !key) row.created_by = staff.id;
    if (name === "campaigns" && !key) row.created_by = staff.id;
    if (name === "budgets" && !key) row.created_by = staff.id;
    if (name === "pages") row.updated_by = staff.id;
    const { error } = key ? await supabase.from(def.table).update(row).eq(def.key, key) : await supabase.from(def.table).insert(row);
    if (error) return { ok: false, error: say(error.message) };
    if (def.tag) updateTag(tags[def.tag]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function crudDeleteAction(name: string, key: string): Promise<CrudResult> {
  const def = crudTables[name];
  if (!def || def.noDelete) return { ok: false, error: "This cannot be deleted." };
  try {
    const { supabase } = await client();
    const { error } = await supabase.from(def.table).delete().eq(def.key, key);
    if (error) return { ok: false, error: say(error.message) };
    if (def.tag) updateTag(tags[def.tag]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete" };
  }
}
