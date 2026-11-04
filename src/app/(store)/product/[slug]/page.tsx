import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Beacon } from "@/components/store/Beacon";
import { ProductBuy } from "@/components/store/ProductBuy";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductGallery } from "@/components/store/ProductGallery";
import { getCatalogue } from "@/lib/catalogue/server";
import { formatGHS } from "@/lib/data";
import { getAlsoBought, getProductReviews, publicFile } from "@/lib/site/server";

// Cache Components needs at least one path to check the route at build time; a slug nobody uses renders the 404 page.
// Cache Components needs at least one path to check the route at build time. A slug nobody uses renders the 404 page.
export async function generateStaticParams() {
  const slugs = await getCatalogue().then((list) => list.map((x) => x.slug)).catch(() => [] as string[]);
  return (slugs.length ? slugs : ["__placeholder__"]).map((slug) => ({ slug }));
}

/** Titles, descriptions and share images, so product links preview well on WhatsApp and Instagram (FR-SF-015). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalogue()).find((x) => x.slug === slug);
  if (!p) return {};
  const title = p.seoTitle ?? p.name;
  const description = p.seoDescription ?? `${p.name} from ${formatGHS(p.price)}. ${p.description}`.slice(0, 170);
  const image = publicFile("media", p.images?.[0]);
  return {
    title, description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title, description, type: "website", images: image ? [{ url: image, width: 1200, height: 1500 }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span aria-label={label ?? `${value} out of 5`} className="whitespace-nowrap text-lime [text-shadow:0_0_1px_#00115b]">
      {"★".repeat(Math.round(value))}<span className="text-line">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

async function Reviews({ slug }: { slug: string }) {
  const r = await getProductReviews(slug);
  return (
    <details open={r.count > 0} className="border-y border-line py-4" id="reviews">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        Reviews {r.count > 0 && <><Stars value={r.average ?? 0} /> <span className="text-sm font-normal text-text2">{r.average} · {r.count} {r.count === 1 ? "review" : "reviews"}</span></>}
      </summary>
      {r.count === 0 ? (
        <p className="mt-2 text-sm text-text2">No reviews yet. Customers can review this once their order is delivered, from the tracking page or their account.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {r.reviews.map((x, i) => (
            <li key={i} className="text-sm">
              <p className="flex items-center gap-2"><Stars value={x.rating} />{x.title && <b>{x.title}</b>}</p>
              <p className="mt-1">{x.body}</p>
              {x.photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {x.photos.map((ph) => {
                    const src = publicFile("reviews", ph);
                    return src ? <a key={ph} href={src} target="_blank" rel="noopener noreferrer" className="relative block size-16 overflow-hidden rounded-[8px]"><Image src={src} alt="Customer photo" fill sizes="64px" className="object-cover" /></a> : null;
                  })}
                </div>
              )}
              <p className="mt-1 text-xs text-text2">{x.name}{x.city ? `, ${x.city}` : ""} · {x.verified ? "Verified buyer" : x.source === "instagram" ? "From our Instagram reviews" : "Customer"} · {new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(x.at))}</p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

async function ProductPageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const products = await getCatalogue();
  const p = products.find((x) => x.slug === slug);
  if (!p) notFound();

  const [reviews, alsoSlugs] = await Promise.all([getProductReviews(slug), getAlsoBought(slug)]);
  const bySlug = new Map(products.map((x) => [x.slug, x]));
  const also = alsoSlugs.map((s) => bySlug.get(s)).filter((x): x is NonNullable<typeof x> => !!x);
  const related = products.filter((x) => x.slug !== p.slug && x.category !== p.category && !alsoSlugs.includes(x.slug)).slice(0, 4);
  const similar = products.filter((x) => x.slug !== p.slug && x.category === p.category).slice(0, 4);
  const images = (p.images ?? []).map((i) => publicFile("media", i)).filter((x): x is string => !!x);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    brand: { "@type": "Brand", name: p.brand },
    sku: p.sku,
    description: p.description,
    image: images.length ? images : undefined,
    itemCondition: "https://schema.org/NewCondition",
    aggregateRating: reviews.count > 0 ? { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count } : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GHS",
      lowPrice: p.price,
      highPrice: Math.max(...p.variants.map((v) => v.price)),
      offerCount: p.variants.length,
      availability: p.variants.some((v) => v.availability !== "Unavailable") ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2">
        <Link href="/shop" className="hover:text-navy">Shop</Link> › <Link href={`/shop?category=${encodeURIComponent(p.category)}`} className="hover:text-navy">{p.category}</Link> › <span className="text-ink">{p.name}</span>
      </nav>

      <div className="grid gap-8 pb-24 md:grid-cols-2 md:gap-12 md:pb-0">
        <div className="md:sticky md:top-32 md:self-start">
          <ProductGallery slug={p.slug} name={p.name} art={p.art} images={images} video={p.video}
            badges={<>{p.isNew && <span className="chip bg-lime text-navy">NEW</span>}{p.compareAt && <span className="chip bg-white text-navy">SALE</span>}{p.releaseAt && <span className="chip bg-ink text-lime">DROP</span>}</>} />
          {reviews.count > 0 && <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm"><Stars value={reviews.average ?? 0} /> {reviews.average} from {reviews.count} {reviews.count === 1 ? "review" : "reviews"}</a>}
        </div>

        <div>
          <Beacon name="product_view" params={{ product: p.slug, price: p.price, category: p.category }} />
          <ProductBuy product={p} />

          <div className="mt-8">
            <details open className="border-t border-line py-4">
              <summary className="cursor-pointer font-semibold">Description</summary>
              <p className="mt-2 text-sm leading-relaxed text-text2">{p.description}</p>
              <ul className="mt-3 space-y-1 text-sm text-text2">
                {p.details.map((d) => <li key={d} className="flex gap-2"><span className="text-success">✓</span> {d}</li>)}
                {p.material && <li className="flex gap-2"><span className="text-success">✓</span> Material: {p.material}</li>}
              </ul>
            </details>
            {p.careNotes && (
              <details className="border-t border-line py-4">
                <summary className="cursor-pointer font-semibold">Care</summary>
                <p className="mt-2 text-sm leading-relaxed text-text2">{p.careNotes}</p>
              </details>
            )}
            <details className="border-t border-line py-4">
              <summary className="cursor-pointer font-semibold">Delivery, returns and exchanges</summary>
              <p className="mt-2 text-sm leading-relaxed text-text2">
                {p.deliveryNotes ? `${p.deliveryNotes} ` : ""}
                We source your item from a trusted supplier once your payment is confirmed. Times shown are estimates, because our own riders and couriers deliver.
                Every item is checked for size, colour and condition before it leaves our branch. <Link href="/help/order-issues" className="text-navy underline">Order issues and refunds</Link>
              </p>
            </details>
            <Suspense fallback={null}><Reviews slug={p.slug} /></Suspense>
          </div>
        </div>
      </div>

      {also.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold md:text-[30px]">Customers also bought</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">{also.map((x) => <ProductCard key={x.slug} product={x} />)}</div>
        </section>
      )}
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold md:text-[30px]">Complete the look</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">{related.map((x) => <ProductCard key={x.slug} product={x} />)}</div>
        </section>
      )}
      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold md:text-[30px]">You may also like</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">{similar.map((x) => <ProductCard key={x.slug} product={x} />)}</div>
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
