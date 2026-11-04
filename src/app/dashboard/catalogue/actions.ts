"use server";

import { updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { availabilityToDb, audienceToDb, slugify } from "@/lib/catalogue/build";
import { CATALOGUE_TAG } from "@/lib/catalogue/tags";
import type { VariantChange } from "@/lib/catalogue/staff-types";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { ok: boolean; saved: number; errors: { id: string; message: string }[]; error?: string };

/** The database's own rule messages are written for people; anything else gets a generic line. */
const friendly = (m: string) => (/^You cannot|^Categories can/.test(m) ? m : "The database did not allow that change.");

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Saves edits made on the catalogue screen. Price and availability are separate rights in the database: a Sourcing
 * Officer's availability edit succeeds while a price edit by someone without "products: edit" is refused for that row.
 */
export async function saveVariants(changes: VariantChange[]): Promise<SaveResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "products", "edit") && !can(me.permissions, "availability", "edit")) {
    return { ok: false, saved: 0, errors: [], error: "You do not have permission to change the catalogue." };
  }
  if (!Array.isArray(changes) || changes.length === 0) return { ok: true, saved: 0, errors: [] };
  if (changes.length > 500) return { ok: false, saved: 0, errors: [], error: "Save at most 500 changes at a time." };

  const supabase = await createClient();
  const errors: SaveResult["errors"] = [];
  let saved = 0;

  for (const c of changes) {
    const fail = (message: string) => errors.push({ id: c.id, message });
    if (c.price !== undefined && (!finite(c.price) || c.price < 0)) { fail("Enter a price of 0 or more."); continue; }
    if (c.leadDays !== undefined && (!Number.isInteger(c.leadDays) || c.leadDays < 0 || c.leadDays > 60)) { fail("Lead time must be 0 to 60 days."); continue; }
    if (c.cost != null && (!finite(c.cost) || c.cost < 0)) { fail("Enter a cost of 0 or more."); continue; }
    if (c.compareAt != null && c.price !== undefined && c.compareAt <= c.price) { fail("A sale's original price must be higher than the price."); continue; }

    const patch: Record<string, unknown> = {};
    if (c.price !== undefined) patch.price = c.price;
    if (c.compareAt !== undefined) patch.compare_at = c.compareAt;
    if (c.availability !== undefined) patch.availability = availabilityToDb(c.availability);
    if (c.leadDays !== undefined) patch.lead_days = c.leadDays;
    if (c.supplierId !== undefined) patch.preferred_supplier_id = c.supplierId;
    if (c.expectedOn !== undefined) patch.expected_on = c.expectedOn;
    if (c.markChecked) patch.last_checked_at = new Date().toISOString();

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase.from("variants").update(patch).eq("id", c.id).select("id").maybeSingle();
      if (error) { fail(friendly(error.message)); continue; }
      if (!data) { fail("You are not allowed to change this item."); continue; }
    }

    if (c.cost != null && c.supplierId) {
      const { error } = await supabase.from("supplier_offers").upsert(
        { variant_id: c.id, supplier_id: c.supplierId, cost: c.cost, available: true, checked_at: new Date().toISOString() },
        { onConflict: "variant_id,supplier_id" },
      );
      if (error) { fail(friendly(error.message)); continue; }
    }
    saved += 1;
  }

  updateTag(CATALOGUE_TAG);
  return { ok: errors.length === 0, saved, errors };
}

/** "Mark all as checked with suppliers today": one statement for every variant of the product. */
export async function markProductChecked(productId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  if (!can(me.permissions, "availability", "edit")) return { ok: false, error: "You do not have permission to update availability." };
  const supabase = await createClient();
  const { error } = await supabase.from("variants").update({ last_checked_at: new Date().toISOString() }).eq("product_id", productId);
  if (error) return { ok: false, error: friendly(error.message) };
  updateTag(CATALOGUE_TAG);
  return { ok: true };
}

export async function setProductPublished(productId: string, published: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  if (!can(me.permissions, "products", "edit")) return { ok: false, error: "You do not have permission to publish products." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ published }).eq("id", productId).select("id").maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: "You are not allowed to change this product." };
  updateTag(CATALOGUE_TAG);
  return { ok: true };
}

export type CreateState = { error?: string; ok?: { id: string; slug: string; variants: number } };

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/**
 * Creates a product and every style x colour x size combination as variants. New variants start "Unavailable" until a
 * sourcing officer confirms a supplier can provide them, so nothing is offered for sale that has not been checked.
 */
export async function createProduct(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const me = await requireStaff();
  if (!can(me.permissions, "products", "create")) return { error: "You do not have permission to add products." };

  const name = String(fd.get("name") ?? "").trim();
  const brand = String(fd.get("brand") ?? "").trim();
  const categoryId = String(fd.get("categoryId") ?? "");
  const audience = audienceToDb(String(fd.get("audience") ?? "unisex"));
  const description = String(fd.get("description") ?? "").trim();
  const details = list(fd.get("details"));
  const styles = list(fd.get("styles"));
  const colours = list(fd.get("colours"));
  const sizes = list(fd.get("sizes"));
  const price = Number(fd.get("price"));
  const leadDays = Number(fd.get("leadDays") || 2);
  const isNew = fd.get("isNew") === "on";

  if (name.length < 2) return { error: "Give the product a name." };
  if (!brand) return { error: "Enter the brand." };
  if (!categoryId) return { error: "Choose a category." };
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a price." };
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 60) return { error: "Lead time must be 0 to 60 days." };
  if (colours.length === 0) return { error: "Add at least one colour." };
  if (sizes.length === 0) return { error: "Add at least one size (use One size for watches and caps)." };
  const count = Math.max(1, styles.length) * colours.length * sizes.length;
  if (count > 400) return { error: `That makes ${count} variants. Keep it under 400 or split it into products.` };

  const slug = slugify(`${brand} ${name}`);
  const sku = (slugify(name).replace(/-/g, "").slice(0, 8) || "ITEM").toUpperCase();

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .insert({ slug, sku: `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`, name, brand, category_id: categoryId, audience, description, details, is_new: isNew, published: false })
    .select("id, sku")
    .single();
  if (error || !product) {
    return { error: /duplicate|unique/i.test(error?.message ?? "") ? "A product with that name already exists." : "Could not add the product." };
  }

  const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const rows = (styles.length ? styles : [null]).flatMap((style) =>
    colours.flatMap((colour) =>
      sizes.map((size) => ({
        product_id: product.id,
        style,
        colour,
        size,
        sku: [product.sku, style && style.slice(0, 2).toUpperCase(), colours.length > 1 && initials(colour), size.replace(/\s+/g, "")].filter(Boolean).join("-"),
        price,
        availability: "unavailable",
        lead_days: leadDays,
      })),
    ),
  );
  const { error: vErr } = await supabase.from("variants").insert(rows);
  if (vErr) {
    await supabase.from("products").delete().eq("id", product.id); // do not leave a product with no variants
    return { error: friendly(vErr.message) === "The database did not allow that change." ? "Could not create the variants. Check for repeated sizes or colours." : friendly(vErr.message) };
  }

  updateTag(CATALOGUE_TAG);
  return { ok: { id: product.id, slug, variants: rows.length } };
}
