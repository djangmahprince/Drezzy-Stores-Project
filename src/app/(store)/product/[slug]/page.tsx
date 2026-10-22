import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductArt } from "@/components/ProductArt";
import { Beacon } from "@/components/store/Beacon";
import { ProductBuy } from "@/components/store/ProductBuy";
import { ProductCard } from "@/components/store/ProductCard";
import { getCatalogue } from "@/lib/catalogue/server";
import { formatGHS } from "@/lib/data";

export async function generateStaticParams() {
  try {
    return (await getCatalogue()).map((p) => ({ slug: p.slug }));
  } catch {
    return []; // the database is unreachable at build time: pages are rendered on first request instead
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalogue()).find((x) => x.slug === slug);
  if (!p) return {};
  return { title: p.name, description: `${p.name} from ${formatGHS(p.price)}. ${p.description}` };
}

async function ProductPageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const products = await getCatalogue();
  const p = products.find((x) => x.slug === slug);
  if (!p) notFound();

  const related = products.filter((x) => x.slug !== p.slug && x.category !== p.category).slice(0, 4);
  const similar = products.filter((x) => x.slug !== p.slug && x.category === p.category).slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    brand: { "@type": "Brand", name: p.brand },
    sku: p.sku,
    description: p.description,
    itemCondition: "https://schema.org/NewCondition",
    offers: {
      "@type": "Offer",
      priceCurrency: "GHS",
      price: p.price,
      availability: p.variants.some((v) => v.availability !== "Unavailable") ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2">
        <Link href="/shop" className="hover:text-navy">Shop</Link> › <Link href={`/shop?category=${p.category}`} className="hover:text-navy">{p.category}</Link> › <span className="text-ink">{p.name}</span>
      </nav>

      <div className="grid gap-8 pb-24 md:grid-cols-2 md:gap-12 md:pb-0">
        <div className="md:sticky md:top-32 md:self-start">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,17,91,0.12)]">
            <ProductArt {...p.art} label={`${p.name}, product image`} />
            <div className="absolute left-4 top-4 flex gap-2">
              {p.isNew && <span className="chip bg-lime text-navy">NEW</span>}
              {p.compareAt && <span className="chip bg-white text-navy">SALE</span>}
            </div>
          </div>
        </div>

        <div>
          <Beacon name="product_view" />
          <ProductBuy product={p} />

          <div className="mt-8">
            <details open className="border-t border-line py-4">
              <summary className="cursor-pointer font-semibold">Description</summary>
              <p className="mt-2 text-sm leading-relaxed text-text2">{p.description}</p>
              <ul className="mt-3 space-y-1 text-sm text-text2">
                {p.details.map((d) => <li key={d} className="flex gap-2"><span className="text-success">✓</span> {d}</li>)}
              </ul>
            </details>
            <details className="border-t border-line py-4">
              <summary className="cursor-pointer font-semibold">Delivery, returns and exchanges</summary>
              <p className="mt-2 text-sm leading-relaxed text-text2">
                We source your item from a trusted supplier once your payment is confirmed. Times shown are estimates, because our own riders and couriers deliver.
                Every item is checked for size, colour and condition before it leaves our branch. <Link href="/help/order-issues" className="text-navy underline">Order issues and refunds</Link>
              </p>
            </details>
            <details className="border-y border-line py-4">
              <summary className="cursor-pointer font-semibold">Reviews</summary>
              <p className="mt-2 text-sm text-text2">No reviews yet. Customers can rate this after their order is delivered.</p>
            </details>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold md:text-[30px]">Complete the look</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((x) => <ProductCard key={x.slug} product={x} />)}
          </div>
        </section>
      )}
      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold md:text-[30px]">You may also like</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {similar.map((x) => <ProductCard key={x.slug} product={x} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="h-8 w-64 animate-pulse rounded-[12px] bg-white" /><div className="aspect-[4/5] max-w-md animate-pulse rounded-[24px] bg-white" /></div>}>
      <ProductPageContent params={params} />
    </Suspense>
  );
}
