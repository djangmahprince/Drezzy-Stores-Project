import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductCard } from "@/components/store/ProductCard";
import { getCatalogue } from "@/lib/catalogue/server";
import type { Product } from "@/lib/catalogue/types";
import { getSiteContent, type Collection } from "@/lib/site/server";

export async function generateStaticParams() {
  try {
    return (await getSiteContent()).collections.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = (await getSiteContent()).collections.find((x) => x.slug === slug);
  return c ? { title: c.seo_title ?? c.title, description: c.seo_description ?? c.description ?? undefined } : {};
}

/** A manual list, or every product matching the rule (FR-CMS-004), for example all Nike sneakers under GHS 500. */
function members(c: Collection, products: Product[]): Product[] {
  if (c.kind === "manual") {
    const by = new Map(products.map((p) => [p.slug, p]));
    return c.product_slugs.map((s) => by.get(s)).filter((p): p is Product => !!p);
  }
  const r = c.rule as { brand?: string; category?: string; audience?: string; max_price?: number; min_price?: number; tag?: string; on_sale?: boolean };
  return products.filter((p) =>
    (!r.brand || p.brand.toLowerCase() === r.brand.toLowerCase()) &&
    (!r.category || p.category.toLowerCase() === r.category.toLowerCase() || (p.subcategory ?? "").toLowerCase() === r.category.toLowerCase()) &&
    (!r.audience || p.audience === r.audience || (r.audience !== "Unisex" && p.audience === "Men and ladies")) &&
    (r.max_price === undefined || p.price <= r.max_price) && (r.min_price === undefined || p.price >= r.min_price) &&
    (!r.tag || (p.tags ?? []).includes(r.tag)) && (!r.on_sale || !!p.compareAt));
}

async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [site, products] = await Promise.all([getSiteContent(), getCatalogue()]);
  const c = site.collections.find((x) => x.slug === slug);
  if (!c) notFound();
  const list = members(c, products);
  return (
    <div>
      <p className="label-wide text-text2">Collection</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">{c.title}</h1>
      {c.description && <p className="mt-2 max-w-2xl text-text2">{c.description}</p>}
      {list.length === 0 ? <p className="card mt-8 p-8 text-center text-text2">Nothing here right now. Check back soon.</p> : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">{list.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="h-64 animate-pulse rounded-[24px] bg-white" />}><CollectionPage params={params} /></Suspense>;
}
