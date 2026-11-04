// Turns database rows into Product objects. Pure, so it is tested without a database.
import { audienceFromDb, availabilityFromDb, buildProduct, defaultArt } from "./build.ts";
import type { Art, Product, Variant } from "./types.ts";

export type VariantRow = {
  id: string; style: string | null; colour: string; size: string; sku: string;
  price: number | string; compare_at: number | string | null; availability: string; lead_days: number;
  sale_price?: number | string | null; sale_starts_at?: string | null; sale_ends_at?: string | null;
};

type CategoryRow = { name: string; parent?: { name: string } | { name: string }[] | null };

export type ProductRow = {
  id: string; slug: string; sku: string; name: string; brand: string; audience: string; description: string;
  details: string[] | null; condition: string; is_new: boolean; popular: number; art: Art | null;
  category: CategoryRow | CategoryRow[] | null;
  variants: VariantRow[] | null;
  images?: string[] | null; video_url?: string | null; material?: string | null; care_notes?: string | null; delivery_notes?: string | null;
  release_at?: string | null; cap_per_customer?: number | null; tags?: string[] | null; seo_title?: string | null; seo_description?: string | null;
};

/** Is a sale running right now? The database applies the same rule when it prices an order. */
export function saleActive(r: Pick<VariantRow, "sale_price" | "sale_starts_at" | "sale_ends_at">, now = Date.now()): boolean {
  if (r.sale_price === null || r.sale_price === undefined) return false;
  if (r.sale_starts_at && Date.parse(r.sale_starts_at) > now) return false;
  if (r.sale_ends_at && Date.parse(r.sale_ends_at) <= now) return false;
  return true;
}

/** Embedded relations come back as an object or a one-item array depending on the client. */
const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export function variantFromRow(r: VariantRow): Variant {
  const compare = r.compare_at === null || r.compare_at === undefined ? undefined : Number(r.compare_at);
  const sale = saleActive(r);
  const v: Variant = {
    id: r.id,
    style: r.style ?? undefined,
    colour: r.colour,
    size: r.size,
    sku: r.sku,
    // during a sale the customer pays the sale price, and the normal price shows struck through
    price: sale ? Number(r.sale_price) : Number(r.price),
    compareAt: sale ? Math.max(Number(r.price), compare ?? 0) : compare,
    availability: availabilityFromDb(r.availability),
    leadDays: r.lead_days,
  };
  if (sale && r.sale_ends_at) v.saleEndsAt = r.sale_ends_at;
  return v;
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
      ...(r.images?.length ? { images: r.images } : {}),
      ...(r.video_url ? { video: r.video_url } : {}),
      ...(r.material ? { material: r.material } : {}),
      ...(r.care_notes ? { careNotes: r.care_notes } : {}),
      ...(r.delivery_notes ? { deliveryNotes: r.delivery_notes } : {}),
      ...(r.release_at ? { releaseAt: r.release_at } : {}),
      ...(r.cap_per_customer ? { cap: r.cap_per_customer } : {}),
      ...(r.tags?.length ? { tags: r.tags } : {}),
      ...(r.seo_title ? { seoTitle: r.seo_title } : {}),
      ...(r.seo_description ? { seoDescription: r.seo_description } : {}),
    },
    (r.variants ?? []).map(variantFromRow),
  );
}

/** The select used for storefront reads: public columns only. */
export const PUBLIC_PRODUCT_SELECT =
  "id, slug, sku, name, brand, audience, description, details, condition, is_new, popular, art, images, video_url, material, care_notes, delivery_notes, " +
  "release_at, cap_per_customer, tags, seo_title, seo_description, " +
  "category:categories!category_id(name, parent:categories!parent_id(name)), " +
  "variants(id, style, colour, size, sku, price, compare_at, sale_price, sale_starts_at, sale_ends_at, availability, lead_days)";
