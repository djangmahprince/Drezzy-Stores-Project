"use server";

import { updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { availabilityToDb, audienceToDb } from "@/lib/catalogue/build";
import { groupProducts, makeSku, parseCsv, resolveCategory, validateTable, variantSku, type ImportIssue } from "@/lib/catalogue/import";
import { CATALOGUE_TAG } from "@/lib/catalogue/tags";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ImportSummary = {
  rows: number; products: number; newProducts: number; updatedProducts: number;
  newVariants: number; updatedVariants: number; newSuppliers: number;
};
export type ImportResult = {
  ok: boolean;
  mode: "preview" | "commit";
  error?: string;
  summary?: ImportSummary;
  issues: ImportIssue[];
  sample: { line: number; product: string; style?: string; colour: string; size: string; price: number; availability: string }[];
};

const MAX_BYTES = 5 * 1024 * 1024;
const fail = (mode: ImportResult["mode"], error: string): ImportResult => ({ ok: false, mode, error, issues: [], sample: [] });
const key = (style: string | null | undefined, colour: string, size: string) => [(style ?? "").toLowerCase(), colour.toLowerCase(), size.toLowerCase()].join("|");

/** Reads the first sheet of an .xlsx, or a .csv, into a table of strings. */
async function readTable(file: File): Promise<string[][] | string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    try {
      const { readSheet } = await import("read-excel-file/node");
      const data = await readSheet(Buffer.from(await file.arrayBuffer()), 1);
      return data.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
    } catch {
      return "That does not look like a valid Excel (.xlsx) file. Try saving it again, or export it as CSV.";
    }
  }
  return "Upload a .xlsx or .csv file. Older .xls files should be saved as .xlsx first.";
}

/**
 * Preview or commit a catalogue spreadsheet. Preview checks every row and reports what would change; commit writes it.
 * New products arrive as drafts and new variants as Unavailable unless the sheet says otherwise, so nothing goes live by accident.
 */
export async function importCatalogue(fd: FormData): Promise<ImportResult> {
  const mode = fd.get("mode") === "commit" ? "commit" : "preview";
  const me = await requireStaff();
  if (!can(me.permissions, "products", "create") || !can(me.permissions, "products", "edit")) return fail(mode, "You do not have permission to import products.");
  if (!isSupabaseConfigured) return fail(mode, "Connect Supabase first. The import writes to the database.");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(mode, "Choose a file first.");
  if (file.size > MAX_BYTES) return fail(mode, "That file is over 5 MB. Split it into smaller files.");

  const table = await readTable(file);
  if (typeof table === "string") return fail(mode, table);

  const supabase = await createClient();
  const [{ data: cats }, { data: sups }] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id, sort").order("sort"),
    supabase.from("suppliers").select("id, name"),
  ]);
  const catRows = (cats ?? []) as { id: string; name: string; parent_id: string | null }[];
  const options = catRows.filter((c) => !c.parent_id).flatMap((t) => {
    const kids = catRows.filter((c) => c.parent_id === t.id);
    return kids.length ? kids.map((k) => ({ id: k.id, label: `${t.name} › ${k.name}` })) : [{ id: t.id, label: t.name }];
  });

  const { rows, issues } = validateTable(table, options);
  if (issues.length > 0) return { ok: false, mode, issues: issues.slice(0, 200), sample: [] };

  const groups = groupProducts(rows);

  // what already exists
  const { data: existing } = await supabase
    .from("products")
    .select("id, slug, sku, variants(id, style, colour, size, sku)")
    .in("slug", groups.map((g) => g.slug));
  type Ex = { id: string; slug: string; sku: string; variants: { id: string; style: string | null; colour: string; size: string; sku: string }[] };
  const exBySlug = new Map(((existing ?? []) as Ex[]).map((p) => [p.slug, p]));

  const supByName = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.name.toLowerCase(), s.id]));
  const wantedSuppliers = [...new Set(rows.flatMap((r) => (r.supplier ? [r.supplier] : [])))];
  const newSupplierNames = wantedSuppliers.filter((n) => !supByName.has(n.toLowerCase()));

  let newVariants = 0, updatedVariants = 0;
  for (const g of groups) {
    const ex = exBySlug.get(g.slug);
    const have = new Set((ex?.variants ?? []).map((v) => key(v.style, v.colour, v.size)));
    for (const r of g.rows) {
      if (have.has(key(r.style, r.colour, r.size))) updatedVariants++;
      else newVariants++;
    }
  }
  const summary: ImportSummary = {
    rows: rows.length, products: groups.length,
    newProducts: groups.filter((g) => !exBySlug.has(g.slug)).length,
    updatedProducts: groups.filter((g) => exBySlug.has(g.slug)).length,
    newVariants, updatedVariants, newSuppliers: newSupplierNames.length,
  };
  const sample = rows.slice(0, 12).map((r) => ({ line: r.line, product: r.product, style: r.style, colour: r.colour, size: r.size, price: r.price, availability: r.availability }));

  if (mode === "preview") return { ok: true, mode, summary, issues: [], sample };

  // ---------- commit ----------
  try {
    for (const name of newSupplierNames) {
      const { data, error } = await supabase.from("suppliers").insert({ name }).select("id").single();
      if (error || !data) throw new Error(`Could not add the supplier "${name}". ${/permission|policy|cannot/i.test(error?.message ?? "") ? "You may not be allowed to add suppliers." : ""}`.trim());
      supByName.set(name.toLowerCase(), data.id);
    }

    for (const g of groups) {
      let ex = exBySlug.get(g.slug);
      if (!ex) {
        const categoryId = resolveCategory(g.categoryText, options)!;
        const { data, error } = await supabase
          .from("products")
          .insert({ slug: g.slug, sku: makeSku(g.name, g.slug), name: g.name, brand: g.brand, category_id: categoryId, audience: audienceToDb(g.audience), description: g.description ?? "", published: false })
          .select("id, slug, sku")
          .single();
        if (error || !data) throw new Error(`Could not add "${g.name}" (${error?.message ?? "unknown error"}).`);
        ex = { ...data, variants: [] };
      }

      const byKey = new Map(ex.variants.map((v) => [key(v.style, v.colour, v.size), v]));
      const multiColour = new Set(g.rows.map((r) => r.colour.toLowerCase())).size > 1;
      const inserts: Record<string, unknown>[] = [];
      const offers: { sku: string; supplier_id: string; cost: number }[] = [];

      for (const r of g.rows) {
        const supplierId = r.supplier ? supByName.get(r.supplier.toLowerCase()) : undefined;
        const found = byKey.get(key(r.style, r.colour, r.size));
        const fields = {
          price: r.price, compare_at: r.compareAt ?? null, availability: availabilityToDb(r.availability),
          lead_days: r.leadDays, preferred_supplier_id: supplierId ?? null, last_checked_at: new Date().toISOString(),
        };
        if (found) {
          const { error } = await supabase.from("variants").update(fields).eq("id", found.id);
          if (error) throw new Error(`Line ${r.line}: ${error.message}`);
          if (supplierId && r.cost !== undefined) offers.push({ sku: found.sku, supplier_id: supplierId, cost: r.cost });
        } else {
          const sku = r.sku ?? variantSku(ex.sku, r.style, r.colour, r.size, multiColour);
          inserts.push({ product_id: ex.id, style: r.style ?? null, colour: r.colour, size: r.size, sku, ...fields });
          if (supplierId && r.cost !== undefined) offers.push({ sku, supplier_id: supplierId, cost: r.cost });
        }
      }

      const idBySku = new Map(ex.variants.map((v) => [v.sku, v.id]));
      for (let i = 0; i < inserts.length; i += 200) {
        const { data, error } = await supabase.from("variants").insert(inserts.slice(i, i + 200)).select("id, sku");
        if (error) throw new Error(`${error.message.includes("sku") ? "A SKU in the file is already used by another product. " : ""}${error.message}`);
        (data ?? []).forEach((v: { id: string; sku: string }) => idBySku.set(v.sku, v.id));
      }

      const offerRows = offers.flatMap((o) => (idBySku.get(o.sku) ? [{ variant_id: idBySku.get(o.sku)!, supplier_id: o.supplier_id, cost: o.cost, available: true }] : []));
      if (offerRows.length) {
        const { error } = await supabase.from("supplier_offers").upsert(offerRows, { onConflict: "variant_id,supplier_id" });
        if (error) throw new Error(`Supplier costs: ${error.message}`);
      }
    }
  } catch (e) {
    updateTag(CATALOGUE_TAG);
    return { ok: false, mode, summary, issues: [], sample, error: `The import stopped part-way: ${e instanceof Error ? e.message : "unknown error"} What was already saved is kept, so you can fix the file and import it again.` };
  }

  updateTag(CATALOGUE_TAG);
  return { ok: true, mode, summary, issues: [], sample };
}
