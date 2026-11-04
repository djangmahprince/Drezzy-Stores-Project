import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductCard } from "@/components/store/ProductCard";
import { ShopTheLook } from "@/components/store/ShopTheLook";
import { getCatalogue } from "@/lib/catalogue/server";
import { getSiteContent } from "@/lib/site/server";

// Cache Components needs at least one path to check the route at build time. A slug nobody uses renders the 404 page.
export async function generateStaticParams() {
  const slugs = await getSiteContent().then((c) => c.looks.map((x) => x.slug)).catch(() => [] as string[]);
  return (slugs.length ? slugs : ["__placeholder__"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const l = (await getSiteContent()).looks.find((x) => x.slug === slug);
  return l ? { title: l.title, description: l.intro ?? `Shop the full ${l.title} look at Drezzy Stores.` } : {};
}

/** One outfit (FR-SF-011): the full look with sizes and Add all to bag, then alternatives to swap in. */
async function Look({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [site, products] = await Promise.all([getSiteContent(), getCatalogue()]);
  const look = site.looks.find((l) => l.slug === slug);
  if (!look) notFound();
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const alts = look.items.flatMap((i) => (i.alternatives ?? []).map((a) => bySlug.get(a)).filter((p): p is NonNullable<typeof p> => !!p));
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2"><Link href="/looks" className="hover:text-navy">Shop the look</Link> › <span className="text-ink">{look.title}</span></nav>
      <p className="label-wide text-text2">{look.occasion ?? "Outfit"}</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">{look.title}</h1>
      {look.intro && <p className="mt-2 text-text2">{look.intro}</p>}
      <ShopTheLook items={look.items} />
      {alts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Swap a piece</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">{alts.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="h-64 animate-pulse rounded-[24px] bg-white" />}><Look params={params} /></Suspense>;
}
