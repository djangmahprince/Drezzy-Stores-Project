import "server-only";
import { requireStaff } from "@/lib/auth";
import { buildProduct, availabilityFromDb, audienceFromDb, defaultArt } from "@/lib/catalogue/build";
import { sampleDefs, variantsOf } from "@/lib/catalogue/sample";
import type { ProductEdit, StaffCatalogue, StaffProduct, StaffVariant, SupplierOrderLine, SupplierRow } from "@/lib/catalogue/staff-types";
import type { Art, Product } from "@/lib/catalogue/types";
import { can, canSeeCosts } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const SELECT =
  "id, slug, sku, name, brand, audience, description, details, condition, is_new, popular, published, archived, tags, images, art, category_id, " +
  "category:categories!category_id(name, parent:categories!parent_id(name)), " +
  "variants(id, style, colour, size, sku, price, compare_at, availability, lead_days, expected_on, preferred_supplier_id, last_checked_at, " +
  "offers:supplier_offers(supplier_id, cost, lead_days, available))";

type CatRow = { name: string; parent?: { name: string } | { name: string }[] | null };

type Row = {
  id: string; slug: string; sku: string; name: string; brand: string; audience: string; description: string; details: string[] | null;
  condition: string; is_new: boolean; popular: number; published: boolean; archived: boolean; tags: string[] | null; images: string[] | null; art: Art | null; category_id: string;
  category: CatRow | CatRow[] | null;
  variants: {
    id: string; style: string | null; colour: string; size: string; sku: string; price: number | string; compare_at: number | string | null;
    availability: string; lead_days: number; expected_on: string | null; preferred_supplier_id: string | null; last_checked_at: string | null;
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
    expectedOn: v.expected_on ?? undefined,
    offers: (v.offers ?? []).map((o) => ({ supplierId: o.supplier_id, cost: Number(o.cost), leadDays: o.lead_days ?? undefined, available: o.available })),
  }));
  const base = buildProduct(
    {
      id: r.id, slug: r.slug, sku: r.sku, name: r.name, brand: r.brand, category, subcategory: parent ? cat?.name : undefined,
      audience: audienceFromDb(r.audience), isNew: r.is_new || undefined, popular: r.popular, description: r.description,
      details: r.details ?? [], condition: r.condition, art: r.art ?? defaultArt(category), images: r.images ?? [],
    },
    variants,
  );
  return { ...base, id: r.id, published: r.published, archived: r.archived, tags: r.tags ?? [], categoryId: r.category_id, variants: base.variants as StaffVariant[] };
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
      const unchecked = d.slug === "nike-sb-dunk-low" || d.slug === "dictator-1976-shirt";
      const variants: StaffVariant[] = variantsOf(d).map((v) => ({
        ...v, id: v.sku, preferredSupplierId: "demo-a", offers: [], lastCheckedAt: unchecked ? undefined : new Date().toISOString(),
      }));
      const base = buildProduct(
        { slug: d.slug, sku: d.sku, name: d.name, brand: d.brand, category: d.category, subcategory: d.subcategory, audience: d.audience, isNew: d.isNew, popular: d.popular, description: d.description, details: d.details, condition: "Brand new, original", art: d.art },
        variants,
      );
      return { ...base, id: d.slug, published: true, archived: false, tags: d.tags ?? [], variants: base.variants as StaffVariant[] };
    });
    const at = "2026-11-06T09:10:00Z";
    const line = (id: string, slug: string, status: SupplierOrderLine["status"], text: string, orderNumber: string): SupplierOrderLine => ({ id, productIds: [slug], status, text, at, orderNumber, supplier: "Supplier A", expected: null });
    const supplierOrders = products.flatMap((p) => [line(`${p.slug}-1`, p.slug, "ordered", `EU 39 for DRZ-1036 · Supplier A · due today`, "DRZ-1036"), line(`${p.slug}-2`, p.slug, "received", `EU 40 for DRZ-1029 · Supplier A · receipt attached · cost posted to Money`, "DRZ-1029"), line(`${p.slug}-3`, p.slug, "failed", `EU 45 for DRZ-1012 · no supplier · customer refunded`, "DRZ-1012")]);
    return { mode: "demo", products, suppliers, categories: [], rights, staleDays: 7, supplierOrders };
  }

  const supabase = await createClient();
  const [{ data: rows }, suppliers, { data: cats }, { data: alerts }, supplierOrders] = await Promise.all([
    supabase.from("products").select(SELECT).order("name"),
    getSuppliers(),
    supabase.from("categories").select("id, name, parent_id").order("sort"),
    supabase.from("app_settings").select("value").eq("key", "alerts").maybeSingle(),
    getSupplierOrders(200),
  ]);

  return {
    mode: "db",
    products: ((rows ?? []) as unknown as Row[]).map(fromRow),
    suppliers,
    categories: (cats ?? []).map((c: { id: string; name: string; parent_id: string | null }) => ({ id: c.id, name: c.name, parentId: c.parent_id ?? undefined })),
    rights,
    staleDays: Number((alerts?.value as { stale_days?: number } | null)?.stale_days ?? 7),
    supplierOrders,
  };
}

/** Supplier orders with what each one was for. Row-level security limits this to roles that keep availability. */
export async function getSupplierOrders(limit: number): Promise<SupplierOrderLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supplier_orders")
    .select("id, status, ordered_at, received_at, expected_at, receipt_path, supplier:suppliers(name), order:orders(number), items:supplier_order_items(item:order_items(variant_label, sourcing, variant:variants(product_id)))")
    .order("ordered_at", { ascending: false })
    .limit(limit);
  type Item = { variant_label: string; sourcing: string; variant: { product_id: string } | { product_id: string }[] | null };
  type R = {
    id: string; status: SupplierOrderLine["status"]; ordered_at: string; received_at: string | null; expected_at: string | null; receipt_path: string | null;
    supplier: { name: string } | { name: string }[] | null; order: { number: string } | { number: string }[] | null;
    items: { item: Item | Item[] | null }[] | null;
  };
  return ((data ?? []) as unknown as R[]).map((r) => {
    const items = (r.items ?? []).map((i) => one(i.item)).filter((x) => !!x);
    const orderNumber = one(r.order)?.number ?? "";
    const supplier = one(r.supplier)?.name ?? "Supplier";
    const tail = r.status === "ordered" && r.expected_at ? ` · due ${r.expected_at}` : r.receipt_path ? " · receipt attached" : "";
    return {
      id: r.id, status: r.status, at: r.received_at ?? r.ordered_at, orderNumber, supplier, expected: r.expected_at,
      productIds: items.map((i) => one(i.variant)?.product_id).filter((x): x is string => !!x),
      text: `${r.status === "ordered" && items.some((i) => i.sourcing === "received") ? "Partly received · " : ""}${items.map((i) => i.variant_label).join(", ") || "Items"} for ${orderNumber} · ${supplier}${tail}`,
    };
  });
}

/** The supplier list with everything the PRD keeps about each one. Row-level security applies. */
export async function getSuppliers(): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name, phone, whatsapp, notes, active, contact_person, location, supplies, trusted").order("name");
  type S = { id: string; name: string; phone: string | null; whatsapp: string | null; notes: string | null; active: boolean; contact_person: string | null; location: string | null; supplies: string | null; trusted: boolean };
  return ((data ?? []) as S[]).map((s) => ({
    id: s.id, name: s.name, phone: s.phone ?? undefined, whatsapp: s.whatsapp ?? undefined, notes: s.notes ?? undefined, active: s.active,
    contactPerson: s.contact_person ?? undefined, location: s.location ?? undefined, supplies: s.supplies ?? undefined, trusted: s.trusted,
  }));
}

/** One product for the editor, or null when it does not exist or the person may not see it. */
export async function getProductForEdit(id: string): Promise<ProductEdit | null> {
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, slug, sku, name, brand, category_id, audience, description, details, condition, is_new, popular, tags, images, video_url, material, care_notes, delivery_notes, seo_title, seo_description, family, release_at, cap_per_customer, published, archived, variants(price, compare_at, sale_price, sale_starts_at, sale_ends_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const p = data as unknown as {
    id: string; slug: string; sku: string; name: string; brand: string; category_id: string; audience: string; description: string; details: string[] | null; condition: string;
    is_new: boolean; popular: number; tags: string[] | null; images: string[] | null; video_url: string | null; material: string | null; care_notes: string | null; delivery_notes: string | null;
    seo_title: string | null; seo_description: string | null; family: string | null; release_at: string | null; cap_per_customer: number | null; published: boolean; archived: boolean;
    variants: { price: number | string; compare_at: number | string | null; sale_price: number | string | null; sale_starts_at: string | null; sale_ends_at: string | null }[] | null;
  };
  const vs = p.variants ?? [];
  const prices = vs.map((v) => Number(v.price));
  const onSale = vs.find((v) => v.sale_price !== null);
  const compared = vs.find((v) => v.compare_at !== null);
  return {
    id: p.id, slug: p.slug, sku: p.sku, name: p.name, brand: p.brand, categoryId: p.category_id, audience: p.audience, description: p.description, details: p.details ?? [],
    condition: p.condition, isNew: p.is_new, popular: p.popular, tags: p.tags ?? [], images: p.images ?? [], videoUrl: p.video_url ?? "", material: p.material ?? "", careNotes: p.care_notes ?? "",
    deliveryNotes: p.delivery_notes ?? "", seoTitle: p.seo_title ?? "", seoDescription: p.seo_description ?? "", family: p.family ?? "", releaseAt: p.release_at, capPerCustomer: p.cap_per_customer,
    status: p.archived ? "archived" : p.published ? "active" : "draft",
    sale: {
      minPrice: prices.length ? Math.min(...prices) : 0, maxPrice: prices.length ? Math.max(...prices) : 0,
      salePrice: onSale ? Number(onSale.sale_price) : null, startsAt: onSale?.sale_starts_at ?? null, endsAt: onSale?.sale_ends_at ?? null,
      compareAt: compared ? Number(compared.compare_at) : null,
    },
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
