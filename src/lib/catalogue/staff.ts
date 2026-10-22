import "server-only";
import { requireStaff } from "@/lib/auth";
import { buildProduct, availabilityFromDb, audienceFromDb, defaultArt } from "@/lib/catalogue/build";
import { sampleDefs, variantsOf } from "@/lib/catalogue/sample";
import type { StaffCatalogue, StaffProduct, StaffVariant, SupplierRow } from "@/lib/catalogue/staff-types";
import type { Art, Product } from "@/lib/catalogue/types";
import { can, canSeeCosts } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const SELECT =
  "id, slug, sku, name, brand, audience, description, details, condition, is_new, popular, published, art, category_id, " +
  "category:categories!category_id(name, parent:categories!parent_id(name)), " +
  "variants(id, style, colour, size, sku, price, compare_at, availability, lead_days, preferred_supplier_id, last_checked_at, " +
  "offers:supplier_offers(supplier_id, cost, lead_days, available))";

type CatRow = { name: string; parent?: { name: string } | { name: string }[] | null };

type Row = {
  id: string; slug: string; sku: string; name: string; brand: string; audience: string; description: string; details: string[] | null;
  condition: string; is_new: boolean; popular: number; published: boolean; art: Art | null; category_id: string;
  category: CatRow | CatRow[] | null;
  variants: {
    id: string; style: string | null; colour: string; size: string; sku: string; price: number | string; compare_at: number | string | null;
    availability: string; lead_days: number; preferred_supplier_id: string | null; last_checked_at: string | null;
    offers: { supplier_id: string; cost: number | string; lead_days: number | null; available: boolean }[] | null;
  }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

function fromRow(r: Row): StaffProduct {
  const cat = one(r.category);
  const parent = one(cat?.parent);
  const category = parent?.name ?? cat?.name ?? "Other";
  const variants: StaffVariant[] = (r.variants ?? []).map((v) => ({
    id: v.id,
    style: v.style ?? undefined,
    colour: v.colour,
    size: v.size,
    sku: v.sku,
    price: Number(v.price),
    compareAt: v.compare_at === null ? undefined : Number(v.compare_at),
    availability: availabilityFromDb(v.availability),
    leadDays: v.lead_days,
    preferredSupplierId: v.preferred_supplier_id ?? undefined,
    lastCheckedAt: v.last_checked_at ?? undefined,
    offers: (v.offers ?? []).map((o) => ({ supplierId: o.supplier_id, cost: Number(o.cost), leadDays: o.lead_days ?? undefined, available: o.available })),
  }));
  const base = buildProduct(
    {
      id: r.id, slug: r.slug, sku: r.sku, name: r.name, brand: r.brand, category, subcategory: parent ? cat?.name : undefined,
      audience: audienceFromDb(r.audience), isNew: r.is_new || undefined, popular: r.popular, description: r.description,
      details: r.details ?? [], condition: r.condition, art: r.art ?? defaultArt(category),
    },
    variants,
  );
  return { ...base, id: r.id, published: r.published, categoryId: r.category_id, variants: base.variants as StaffVariant[] };
}

/** The catalogue as staff see it: drafts included, with supplier links and (for permitted roles) costs. Never cached. */
export async function getStaffCatalogue(): Promise<StaffCatalogue> {
  const me = await requireStaff();
  const rights = {
    canEditPrice: can(me.permissions, "products", "edit"),
    canEditAvailability: can(me.permissions, "availability", "edit"),
    canCreate: can(me.permissions, "products", "create"),
    canDelete: can(me.permissions, "products", "delete"),
    canSeeCosts: canSeeCosts(me.permissions),
  };

  if (!isSupabaseConfigured) {
    // Design preview: the sample catalogue, shaped like the real thing so the screens behave the same.
    const suppliers: SupplierRow[] = [
      { id: "demo-a", name: "Supplier A", active: true },
      { id: "demo-b", name: "Supplier B", active: true },
    ];
    const products: StaffProduct[] = sampleDefs.map((d) => {
      const unchecked = d.slug === "new-balance-2000" || d.slug === "striped-quarter-zip";
      const variants: StaffVariant[] = variantsOf(d).map((v) => ({
        ...v, id: v.sku, preferredSupplierId: "demo-a", offers: [], lastCheckedAt: unchecked ? undefined : "2026-10-20T08:00:00Z",
      }));
      const base = buildProduct(
        { slug: d.slug, sku: d.sku, name: d.name, brand: d.brand, category: d.category, subcategory: d.subcategory, audience: d.audience, isNew: d.isNew, popular: d.popular, description: d.description, details: d.details, condition: "Brand new, original", art: d.art },
        variants,
      );
      return { ...base, id: d.slug, published: true, variants: base.variants as StaffVariant[] };
    });
    return { mode: "demo", products, suppliers, categories: [], rights };
  }

  const supabase = await createClient();
  const [{ data: rows }, { data: sup }, { data: cats }] = await Promise.all([
    supabase.from("products").select(SELECT).order("name"),
    supabase.from("suppliers").select("id, name, phone, whatsapp, notes, active").order("name"),
    supabase.from("categories").select("id, name, parent_id").order("sort"),
  ]);

  return {
    mode: "db",
    products: ((rows ?? []) as unknown as Row[]).map(fromRow),
    suppliers: (sup ?? []).map((s: { id: string; name: string; phone: string | null; whatsapp: string | null; notes: string | null; active: boolean }) => ({
      id: s.id, name: s.name, phone: s.phone ?? undefined, whatsapp: s.whatsapp ?? undefined, notes: s.notes ?? undefined, active: s.active,
    })),
    categories: (cats ?? []).map((c: { id: string; name: string; parent_id: string | null }) => ({ id: c.id, name: c.name, parentId: c.parent_id ?? undefined })),
    rights,
  };
}

/** Categories a product can be filed under: second-level ones where a category has them, otherwise the top level itself. */
export async function getCategoryOptions(): Promise<{ id: string; label: string }[]> {
  await requireStaff();
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name, parent_id, sort").order("sort");
  const cats = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
  const tops = cats.filter((c) => !c.parent_id);
  return tops.flatMap((t) => {
    const kids = cats.filter((c) => c.parent_id === t.id);
    return kids.length ? kids.map((k) => ({ id: k.id, label: `${t.name} › ${k.name}` })) : [{ id: t.id, label: t.name }];
  });
}

/**
 * Published products for the staff order form. Supplier links and costs are stripped, so they never reach this screen.
 * Staff creating an order need availability and lead time, not what suppliers charge.
 */
export async function getSellableProducts(): Promise<Product[]> {
  const { products } = await getStaffCatalogue();
  // An explicit allow-list: a field added to the staff types later cannot reach this screen by accident.
  return products
    .filter((p) => p.published)
    .map((p) => ({
      slug: p.slug, sku: p.sku, name: p.name, brand: p.brand, category: p.category, subcategory: p.subcategory, audience: p.audience,
      price: p.price, compareAt: p.compareAt, priceVaries: p.priceVaries, styles: p.styles, colours: p.colours, sizes: p.sizes,
      isNew: p.isNew, popular: p.popular, leadDays: p.leadDays, description: p.description, details: p.details, condition: p.condition, art: p.art,
      variants: p.variants.map((v) => ({
        id: v.id, style: v.style, colour: v.colour, size: v.size, sku: v.sku, price: v.price, compareAt: v.compareAt, availability: v.availability, leadDays: v.leadDays,
      })),
    }));
}
