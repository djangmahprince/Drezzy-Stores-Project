// Turns database rows into Product objects. Pure, so it is tested without a database.
import { audienceFromDb, availabilityFromDb, buildProduct, defaultArt } from "./build.ts";
import type { Art, Product, Variant } from "./types.ts";

export type VariantRow = {
  id: string; style: string | null; colour: string; size: string; sku: string;
  price: number | string; compare_at: number | string | null; availability: string; lead_days: number;
};

type CategoryRow = { name: string; parent?: { name: string } | { name: string }[] | null };

export type ProductRow = {
  id: string; slug: string; sku: string; name: string; brand: string; audience: string; description: string;
  details: string[] | null; condition: string; is_new: boolean; popular: number; art: Art | null;
  category: CategoryRow | CategoryRow[] | null;
  variants: VariantRow[] | null;
};

/** Embedded relations come back as an object or a one-item array depending on the client. */
const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export function variantFromRow(r: VariantRow): Variant {
  const compare = r.compare_at === null ? undefined : Number(r.compare_at);
  return {
    id: r.id,
    style: r.style ?? undefined,
    colour: r.colour,
    size: r.size,
    sku: r.sku,
    price: Number(r.price),
    compareAt: compare,
    availability: availabilityFromDb(r.availability),
    leadDays: r.lead_days,
  };
}

export function productFromRow(r: ProductRow): Product {
  const cat = one(r.category);
  const parent = one(cat?.parent);
  const category = parent?.name ?? cat?.name ?? "Other";
  return buildProduct(
    {
      id: r.id, slug: r.slug, sku: r.sku, name: r.name, brand: r.brand,
      category, subcategory: parent ? cat?.name : undefined,
      audience: audienceFromDb(r.audience), isNew: r.is_new || undefined, popular: r.popular,
      description: r.description, details: r.details ?? [], condition: r.condition,
      art: r.art ?? defaultArt(category),
    },
    (r.variants ?? []).map(variantFromRow),
  );
}

/** The select used for storefront reads: public columns only. */
export const PUBLIC_PRODUCT_SELECT =
  "id, slug, sku, name, brand, audience, description, details, condition, is_new, popular, art, " +
  "category:categories!category_id(name, parent:categories!parent_id(name)), " +
  "variants(id, style, colour, size, sku, price, compare_at, availability, lead_days)";
