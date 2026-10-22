import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductArt } from "@/components/ProductArt";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { ShopTheLook } from "@/components/store/ShopTheLook";
import { parseBody } from "@/lib/articles/format";
import { getArticles } from "@/lib/articles/server";
import { availabilitySummary } from "@/lib/catalogue/build";
import { getCatalogue } from "@/lib/catalogue/server";
import { formatGHS } from "@/lib/data";

export async function generateStaticParams() {
  try {
    return (await getArticles()).map((a) => ({ slug: a.slug }));
  } catch {
    return []; // the database is unreachable at build time: pages are rendered on first request instead
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = (await getArticles()).find((x) => x.slug === slug);
  return a ? { title: a.title, description: a.intro } : {};
}

async function ArticleContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const articles = await getArticles();
  const a = articles.find((x) => x.slug === slug);
  if (!a) notFound();

  const dunk = (await getCatalogue()).find((p) => p.slug === "nike-dunk");
  const more = articles.filter((x) => x.slug !== a.slug).slice(0, 2);

  return (
    <article className="mx-auto max-w-2xl text-[17px] leading-[1.7]">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2">
        <Link href="/drip-school" className="hover:text-navy">Drip School</Link> › <span className="text-ink">{a.type}</span>
      </nav>
      <div className="aspect-[16/9] overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,17,91,0.12)]">
        <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label={a.title} />
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-text2">{a.type}</p>
      <h1 className="text-[28px] font-bold leading-tight md:text-[40px]">{a.title}</h1>
      <p className="text-sm text-text2">{a.minutes} min read · Drezzy Team</p>

      <p className="mt-6">{a.intro}</p>

      {a.body ? (
        <div className="mt-4 space-y-4">
          {parseBody(a.body).map((b, i) =>
            b.t === "h" ? <h2 key={i} className="mt-8 text-[22px] font-bold">{b.text}</h2>
            : b.t === "ul" ? <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
            : <p key={i}>{b.text}</p>)}
        </div>
      ) : a.slug === "5-ways-to-wear-nike-dunks" ? (
        <>
          <h2 className="mt-8 text-[22px] font-bold">1. Campus casual</h2>
          <p>Wide-leg jeans, a plain tee and a cap. Keep the clothes simple and let the shoes carry the colour.</p>
          {dunk && (
            <div className="card my-4 flex items-center gap-4 p-3 text-base">
              <span className="size-16 shrink-0 overflow-hidden rounded-[12px]"><ProductArt {...dunk.art} label="" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{dunk.name}</p>
                <p className="text-sm text-text2">{dunk.colours[0]} · <span className="font-medium text-success">{availabilitySummary(dunk).label}</span> · {formatGHS(dunk.price)}</p>
              </div>
              <Link href={`/product/${dunk.slug}`} className="btn-outline !min-h-11">View</Link>
            </div>
          )}

          <h2 className="mt-8 text-[22px] font-bold">2. Denim on denim</h2>
          <p>A matching denim set looks sharp with a mid-top. Roll the hem once so the collar of the shoe shows.</p>
          <ShopTheLook items={[{ slug: "navy-cap" }, { slug: "denim-set" }, { slug: "nike-dunk", style: "Mid" }]} />

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
