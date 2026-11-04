import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductArt } from "@/components/ProductArt";
import { ProductPhoto } from "@/components/ProductPhoto";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { ShopTheLook } from "@/components/store/ShopTheLook";
import { ArticleReader, ShareArticle } from "@/components/store/ArticleReader";
import { RichBody } from "@/components/store/RichBody";
import { headings, parseBody } from "@/lib/articles/format";
import { getSiteContent, publicFile } from "@/lib/site/server";
import { getArticles } from "@/lib/articles/server";
import { availabilitySummary } from "@/lib/catalogue/build";
import { getCatalogue } from "@/lib/catalogue/server";
import { formatGHS } from "@/lib/data";

// Cache Components needs at least one path to check the route at build time; a slug nobody uses renders the 404 page.
// Cache Components needs at least one path to check the route at build time. A slug nobody uses renders the 404 page.
export async function generateStaticParams() {
  const slugs = await getArticles().then((list) => list.map((x) => x.slug)).catch(() => [] as string[]);
  return (slugs.length ? slugs : ["__placeholder__"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = (await getArticles()).find((x) => x.slug === slug);
  if (!a) return {};
  const image = publicFile("media", a.share_image ?? a.hero_image);
  const title = a.seo_title ?? a.title;
  const description = (a.seo_description ?? a.intro).slice(0, 170);
  return { title, description, alternates: { canonical: `/drip-school/${a.slug}` }, openGraph: { title, description, type: "article", images: image ? [image] : undefined } };
}

async function ArticleContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const articles = await getArticles();
  const a = articles.find((x) => x.slug === slug);
  if (!a) notFound();

  const [catalogue, site] = await Promise.all([getCatalogue(), getSiteContent()]);
  const dunk = catalogue.find((p) => p.slug === "nike-sb-dunk-low");
  // related stories: same tags first, then the same type, then the newest
  const score = (x: typeof a) => (x.tags ?? []).filter((t) => (a.tags ?? []).includes(t)).length * 2 + (x.type === a.type ? 1 : 0);
  const more = articles.filter((x) => x.slug !== a.slug).sort((x, y) => score(y) - score(x)).slice(0, 2);
  const toc = a.body ? headings(parseBody(a.body)) : [];
  const hero = publicFile("media", a.hero_image);
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.intro, author: { "@type": "Organization", name: a.author_name ?? "Drezzy Stores" }, datePublished: a.publish_at ?? undefined, image: hero ?? undefined, publisher: { "@type": "Organization", name: "Drezzy Stores" } };

  return (
    <article className="mx-auto max-w-2xl text-[17px] leading-[1.7]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ArticleReader slug={a.slug} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2">
        <Link href="/drip-school" className="hover:text-navy">Drip School</Link> › <span className="text-ink">{a.type}</span>
      </nav>
      <div className="relative aspect-[16/9] overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,17,91,0.12)]">
        {hero ? <Image src={hero} alt="" fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" priority />
          : <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label={a.title} />}
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-text2">{a.type}</p>
      <h1 className="text-[28px] font-bold leading-tight md:text-[40px]">{a.title}</h1>
      <p className="text-sm text-text2">{a.minutes} min read · {a.author_name ?? "Drezzy Team"}{a.publish_at ? ` · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(a.publish_at))}` : ""}</p>
      <div className="mt-3"><ShareArticle title={a.title} /></div>

      <p className="mt-6">{a.intro}</p>

      {toc.length >= 3 && (
        <nav aria-label="In this guide" className="card mt-6 p-4 text-base">
          <p className="font-semibold">In this guide</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-navy">{toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="underline">{h.text}</a></li>)}</ol>
        </nav>
      )}

      {a.body ? (
        <div className="mt-4">
          <RichBody body={a.body} article={a.slug} looks={site.looks.map((l) => ({ slug: l.slug, title: l.title, items: l.items }))} />
        </div>
      ) : a.slug === "5-ways-to-wear-nike-dunks" ? (
        <>
          <h2 className="mt-8 text-[22px] font-bold">1. Campus casual</h2>
          <p>Wide-leg jeans, a plain tee and a cap. Keep the clothes simple and let the shoes carry the colour.</p>
          {dunk && (
            <div className="card my-4 flex items-center gap-4 p-3 text-base">
              <span className="size-16 shrink-0 overflow-hidden rounded-[12px]"><ProductPhoto product={dunk} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{dunk.name}</p>
                <p className="text-sm text-text2">{dunk.colours[0]} · <span className="font-medium text-success">{availabilitySummary(dunk).label}</span> · {formatGHS(dunk.price)}</p>
              </div>
              <Link href={`/product/${dunk.slug}`} className="btn-outline !min-h-11">View</Link>
            </div>
          )}

          <h2 className="mt-8 text-[22px] font-bold">2. Statement top, clean shoes</h2>
          <p>Let a bold shirt do the talking and keep the Dunks simple. White with black ties the whole fit together.</p>
          <ShopTheLook items={[{ slug: "dictator-1976-shirt" }, { slug: "nike-sb-dunk-low" }]} />

          <h2 className="mt-8 text-[22px] font-bold">3 to 5. More quick looks</h2>
          <p><strong>Sunday smart:</strong> pressed trousers, a knit polo and clean white Dunks. <strong>Matching set:</strong> a two-piece polo and trouser set with a high-top. <strong>Night out:</strong> all black with one colour pop on the shoe.</p>
        </>
      ) : (
        <p className="mt-4">
          Ready to shop? <Link href="/shop?category=Sneakers" className="font-semibold text-navy underline">Browse sneakers</Link> and use the size guide on each product page.
        </p>
      )}

      {!a.body && <div className="mt-6 rounded-[12px] bg-lime p-4 text-base text-navy">
        <p className="font-bold">SIZE TIP</p>
        <p>Dunks run true to size. If you are between sizes, go up half a size for a roomier fit. <Link href="/help/size-guide" className="font-semibold underline">Open the size guide</Link></p>
      </div>}

      {(a.tags?.length ?? 0) > 0 && <p className="mt-6 flex flex-wrap gap-2 text-sm">{a.tags!.map((t) => <Link key={t} href={`/drip-school?tag=${encodeURIComponent(t)}`} className="chip min-h-9 border border-line bg-white px-3 text-navy">#{t}</Link>)}</p>}
      <p className="mt-4 text-sm text-text2">New to sneaker talk? <Link href="/drip-school/glossary" className="font-semibold text-navy underline">Read the glossary</Link></p>

      <NewsletterForm />

      <section className="mt-12">
        <h2 className="text-[22px] font-bold">Keep reading</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {more.map((m) => (
            <Link key={m.slug} href={`/drip-school/${m.slug}`} className="card group block overflow-hidden text-base leading-snug">
              <div className="aspect-[16/9] overflow-hidden"><ProductArt kind={m.kind} tone={m.tone} upper={m.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label="" className="transition duration-300 group-hover:scale-105" /></div>
              <div className="p-4"><p className="text-xs font-semibold uppercase text-text2">{m.type}</p><p className="mt-1 font-semibold">{m.title}</p></div>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}

export default function Article({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl animate-pulse space-y-4" aria-busy="true"><div className="aspect-[16/9] rounded-[24px] bg-white" /><div className="h-8 w-3/4 rounded-[12px] bg-white" /></div>}>
      <ArticleContent params={params} />
    </Suspense>
  );
}
