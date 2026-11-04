"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { availabilityToDb, audienceToDb } from "@/lib/catalogue/build";
import { parseAvailability } from "@/lib/catalogue/import";
import { readTable } from "@/lib/catalogue/read-table";
import type { BulkPatch, ProductStatus } from "@/lib/catalogue/staff-types";
import { CATALOGUE_TAG } from "@/lib/catalogue/tags";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ToolResult = { ok: boolean; error?: string; note?: string };

const NOT_CONNECTED: ToolResult = { ok: false, error: "Connect Supabase first. This preview does not save." };
const friendly = (m: string) => (/^You cannot|^Categories can/.test(m) ? m : /compare_at|sale_below/.test(m) ? "A sale or compare-at price no longer fits the new price. Clear it first." : "The database did not allow that change.");
const statusRow = (s: ProductStatus) => ({ published: s === "active", archived: s === "archived" });
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

/** Bulk edit (FR-CAT-007): one change across the selected products. The database checks each right again. */
export async function bulkEditProducts(ids: string[], patch: BulkPatch): Promise<ToolResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return NOT_CONNECTED;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "Select at least one product." };
  if (ids.length > 500) return { ok: false, error: "Select at most 500 products at a time." };
  const edit = can(me.permissions, "products", "edit");
  const avail = can(me.permissions, "availability", "edit");
  const wantsProduct = patch.price !== undefined || patch.pricePct !== undefined || patch.categoryId || patch.status || patch.addTags?.length || patch.removeTags?.length;
  if (wantsProduct && !edit) return { ok: false, error: "You do not have permission to change prices or product details." };
  if ((patch.availability || patch.leadDays !== undefined || patch.markChecked) && !avail) return { ok: false, error: "You do not have permission to change availability." };
  if (patch.price !== undefined && (!Number.isFinite(patch.price) || patch.price < 0)) return { ok: false, error: "Enter a price of 0 or more." };
  if (patch.pricePct !== undefined && (!Number.isFinite(patch.pricePct) || patch.pricePct <= -100 || patch.pricePct > 500)) return { ok: false, error: "Enter a percentage above -100 and up to 500." };
  if (patch.leadDays !== undefined && (!Number.isInteger(patch.leadDays) || patch.leadDays < 0 || patch.leadDays > 60)) return { ok: false, error: "Lead time must be 0 to 60 days." };

  const supabase = await createClient();
  const variantPatch: Record<string, unknown> = {};
  if (patch.price !== undefined) variantPatch.price = patch.price;
  if (patch.availability) variantPatch.availability = availabilityToDb(patch.availability);
  if (patch.leadDays !== undefined) variantPatch.lead_days = patch.leadDays;
  if (patch.markChecked) variantPatch.last_checked_at = new Date().toISOString();
  if (Object.keys(variantPatch).length) {
    const { error } = await supabase.from("variants").update(variantPatch).in("product_id", ids);
    if (error) return { ok: false, error: friendly(error.message) };
  }

  if (patch.pricePct !== undefined) {
    const { data, error } = await supabase.from("variants").select("id, price").in("product_id", ids);
    if (error) return { ok: false, error: friendly(error.message) };
    // one write per new price, not one per size
    const byPrice = new Map<number, string[]>();
    for (const v of (data ?? []) as { id: string; price: number | string }[]) {
      const next = Math.round(Number(v.price) * (1 + patch.pricePct / 100));
      byPrice.set(next, [...(byPrice.get(next) ?? []), v.id]);
    }
    for (const [price, vids] of byPrice) {
      const r = await supabase.from("variants").update({ price }).in("id", vids);
      if (r.error) return { ok: false, error: friendly(r.error.message) };
    }
  }

  const productPatch: Record<string, unknown> = {};
  if (patch.categoryId) productPatch.category_id = patch.categoryId;
  if (patch.status) Object.assign(productPatch, statusRow(patch.status));
  if (Object.keys(productPatch).length) {
    const { error } = await supabase.from("products").update(productPatch).in("id", ids);
    if (error) return { ok: false, error: friendly(error.message) };
  }

  if (patch.addTags?.length || patch.removeTags?.length) {
    const { data } = await supabase.from("products").select("id, tags").in("id", ids);
    const drop = new Set((patch.removeTags ?? []).map((t) => t.toLowerCase()));
    for (const p of (data ?? []) as { id: string; tags: string[] | null }[]) {
      const tags = [...new Set([...(p.tags ?? []), ...(patch.addTags ?? [])])].filter((t) => !drop.has(t.toLowerCase()));
      const r = await supabase.from("products").update({ tags }).eq("id", p.id);
      if (r.error) return { ok: false, error: friendly(r.error.message) };
    }
  }

  updateTag(CATALOGUE_TAG);
  revalidatePath("/dashboard/catalogue");
  return { ok: true, note: `Updated ${ids.length} ${ids.length === 1 ? "product" : "products"}.` };
}

export type ProductValues = {
  name: string; brand: string; categoryId: string; audience: string; description: string; details: string[]; condition: string; isNew: boolean; popular: number;
  tags: string[]; images: string[]; videoUrl: string; material: string; careNotes: string; deliveryNotes: string; seoTitle: string; seoDescription: string; family: string;
  releaseAt: string | null; capPerCustomer: number | null; status: ProductStatus;
};

/** Saves the product editor. Only these columns can be written, with the person's own session. */
export async function saveProductAction(id: string, v: ProductValues): Promise<ToolResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return NOT_CONNECTED;
  if (!can(me.permissions, "products", "edit")) return { ok: false, error: "You do not have permission to edit products." };
  if (String(v.name ?? "").trim().length < 2) return { ok: false, error: "Give the product a name." };
  if (!String(v.brand ?? "").trim()) return { ok: false, error: "Enter the brand." };
  if (!v.categoryId) return { ok: false, error: "Choose a category." };
  if (v.videoUrl && !/^https:\/\//.test(v.videoUrl)) return { ok: false, error: "The video link must start with https://" };
  if (v.capPerCustomer !== null && (!Number.isInteger(v.capPerCustomer) || v.capPerCustomer < 1 || v.capPerCustomer > 20)) return { ok: false, error: "The limit per customer must be 1 to 20." };
  if (v.status === "active" && v.images.length === 0) return { ok: false, error: "Add at least one photo before making this product active." };
  if (!Array.isArray(v.images) || v.images.length > 12) return { ok: false, error: "Use at most 12 photos." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({
    name: v.name.trim().slice(0, 140), brand: v.brand.trim().slice(0, 60), category_id: v.categoryId, audience: audienceToDb(v.audience), description: v.description.trim(),
    details: v.details.map((d) => d.trim()).filter(Boolean), condition: v.condition.trim() || "Brand new, original", is_new: v.isNew, popular: Number.isFinite(v.popular) ? Math.trunc(v.popular) : 0,
    tags: v.tags.map((t) => t.trim()).filter(Boolean), images: v.images, video_url: clean(v.videoUrl, 500), material: clean(v.material, 200), care_notes: clean(v.careNotes, 600), delivery_notes: clean(v.deliveryNotes, 600),
    seo_title: clean(v.seoTitle, 70), seo_description: clean(v.seoDescription, 170), family: clean(v.family, 60), release_at: v.releaseAt, cap_per_customer: v.capPerCustomer, ...statusRow(v.status),
  }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: "You are not allowed to change this product." };
  updateTag(CATALOGUE_TAG);
  revalidatePath("/dashboard/catalogue");
  return { ok: true, note: "Saved. The shop shows it within seconds." };
}

/** Puts every size on sale, or ends the sale. A percentage is worked out from each size's own price. */
export async function setSaleAction(productId: string, s: { amount?: number; pct?: number; startsAt: string | null; endsAt: string | null } | null): Promise<ToolResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return NOT_CONNECTED;
  if (!can(me.permissions, "products", "edit")) return { ok: false, error: "You do not have permission to set sales." };
  const supabase = await createClient();
  if (s === null) {
    const { error } = await supabase.from("variants").update({ sale_price: null, sale_starts_at: null, sale_ends_at: null }).eq("product_id", productId);
    if (error) return { ok: false, error: friendly(error.message) };
    updateTag(CATALOGUE_TAG);
    return { ok: true, note: "Sale ended." };
  }
  if (s.startsAt && s.endsAt && Date.parse(s.endsAt) <= Date.parse(s.startsAt)) return { ok: false, error: "The sale must end after it starts." };
  const { data } = await supabase.from("variants").select("id, price").eq("product_id", productId);
  const rows = (data ?? []) as { id: string; price: number | string }[];
  const byPrice = new Map<number, string[]>();
  for (const v of rows) {
    const price = Number(v.price);
    const sale = s.pct !== undefined ? Math.round(price * (1 - s.pct / 100)) : Number(s.amount);
    if (!Number.isFinite(sale) || sale < 0 || sale >= price) return { ok: false, error: `The sale price must be below GHS ${price}.` };
    byPrice.set(sale, [...(byPrice.get(sale) ?? []), v.id]);
  }
  for (const [sale, ids] of byPrice) {
    const { error } = await supabase.from("variants").update({ sale_price: sale, sale_starts_at: s.startsAt, sale_ends_at: s.endsAt }).in("id", ids);
    if (error) return { ok: false, error: friendly(error.message) };
  }
  updateTag(CATALOGUE_TAG);
  return { ok: true, note: "Sale saved." };
}

/** After a call with a supplier: everything from them counts as checked today (FR-CAT-005). */
export async function confirmSupplierAction(supplierId: string): Promise<ToolResult> {
  await requireStaff();
  if (!isSupabaseConfigured) return NOT_CONNECTED;
  const { data, error } = await (await createClient()).rpc("confirm_supplier_checked", { p_supplier: supplierId });
  if (error) return { ok: false, error: friendly(error.message) };
  updateTag(CATALOGUE_TAG);
  return { ok: true, note: `${data ?? 0} sizes marked as checked today.` };
}

export type PriceListResult = { ok: boolean; error?: string; mode: "preview" | "commit"; matched: number; unknown: string[]; bad: string[]; rises: number; falls: number; news: number };

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z ]/g, "").trim();

/**
 * A supplier's price list (FR-CAT-011): columns SKU, Cost, and optionally Lead time and Available. The preview shows what
 * would change; nothing is written until staff confirm. SKUs we do not sell are listed, not created.
 */
export async function importPriceList(fd: FormData): Promise<PriceListResult> {
  const mode: PriceListResult["mode"] = fd.get("mode") === "commit" ? "commit" : "preview";
  const empty = { mode, matched: 0, unknown: [], bad: [], rises: 0, falls: 0, news: 0 } as const;
  const fail = (error: string): PriceListResult => ({ ...empty, unknown: [], bad: [], ok: false, error });
  const me = await requireStaff();
  if (!isSupabaseConfigured) return fail("Connect Supabase first. The price list writes to the database.");
  if (!can(me.permissions, "availability", "edit")) return fail("You do not have permission to update supplier prices.");
  const supplierId = String(fd.get("supplierId") ?? "");
  const file = fd.get("file");
  if (!supplierId) return fail("Choose a supplier.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file first.");
  if (file.size > 5 * 1024 * 1024) return fail("That file is over 5 MB.");
  const table = await readTable(file);
  if (typeof table === "string") return fail(table);
  if (table.length < 2) return fail("The file has no rows.");

  const heads = table[0].map((h) => norm(String(h)));
  const col = (...names: string[]) => heads.findIndex((h) => names.includes(h));
  const iSku = col("sku", "code", "item code");
  const iCost = col("cost", "price", "supplier cost", "cost price", "buying price", "wholesale");
  const iLead = col("lead time", "lead days", "lead time days", "days");
  const iAvail = col("available", "availability", "in stock", "stock");
  if (iSku < 0 || iCost < 0) return fail("The header row needs SKU and Cost columns.");

  const rows: { sku: string; cost: number; lead: number | null; available: boolean }[] = [];
  const bad: string[] = [];
  table.slice(1).forEach((r, i) => {
    const sku = String(r[iSku] ?? "").trim();
    const cost = Number(String(r[iCost] ?? "").replace(/ghs|₵|,/gi, "").trim());
    const lead = iLead >= 0 && String(r[iLead] ?? "").trim() !== "" ? Number(r[iLead]) : null;
    const a = iAvail >= 0 ? parseAvailability(String(r[iAvail] ?? "")) : "Available";
    if (!sku || !Number.isFinite(cost) || cost < 0 || (lead !== null && (!Number.isInteger(lead) || lead < 0 || lead > 60)) || !a) { bad.push(`Line ${i + 2}`); return; }
    rows.push({ sku, cost, lead, available: a !== "Unavailable" });
  });
  if (rows.length > 5000) return fail("Keep a price list under 5,000 rows.");

  const supabase = await createClient();
  const { data: variants } = await supabase.from("variants").select("id, sku").in("sku", rows.map((r) => r.sku));
  const idBySku = new Map(((variants ?? []) as { id: string; sku: string }[]).map((v) => [v.sku.toLowerCase(), v.id]));
  const hits = rows.filter((r) => idBySku.has(r.sku.toLowerCase()));
  const unknown = rows.filter((r) => !idBySku.has(r.sku.toLowerCase())).map((r) => r.sku);
  const { data: offers } = await supabase.from("supplier_offers").select("variant_id, cost").eq("supplier_id", supplierId).in("variant_id", hits.map((r) => idBySku.get(r.sku.toLowerCase())!));
  const old = new Map(((offers ?? []) as { variant_id: string; cost: number | string }[]).map((o) => [o.variant_id, Number(o.cost)]));
  let rises = 0, falls = 0, news = 0;
  for (const r of hits) {
    const before = old.get(idBySku.get(r.sku.toLowerCase())!);
    if (before === undefined) news++; else if (r.cost > before) rises++; else if (r.cost < before) falls++;
  }
  const out = { mode, matched: hits.length, unknown: unknown.slice(0, 50), bad: bad.slice(0, 50), rises, falls, news };
  if (mode === "preview") return { ok: true, ...out };
  if (bad.length) return { ok: false, error: "Fix the bad rows first. Nothing was saved.", ...out };

  const now = new Date().toISOString();
  const { error } = await supabase.from("supplier_offers").upsert(
    hits.map((r) => ({ variant_id: idBySku.get(r.sku.toLowerCase())!, supplier_id: supplierId, cost: r.cost, lead_days: r.lead, available: r.available, checked_at: now })),
    { onConflict: "variant_id,supplier_id" },
  );
  if (error) return { ok: false, error: friendly(error.message), ...out };
  updateTag(CATALOGUE_TAG);
  return { ok: true, ...out };
}
