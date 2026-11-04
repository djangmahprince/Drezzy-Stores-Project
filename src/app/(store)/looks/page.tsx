import Link from "next/link";
import { ProductPhoto } from "@/components/ProductPhoto";
import { getCatalogue } from "@/lib/catalogue/server";
import { getSiteContent } from "@/lib/site/server";

export const metadata = { title: "Shop the look", description: "Complete outfits from Drezzy Stores. Add the whole look to your bag in one tap." };

export default async function Looks() {
  const [site, products] = await Promise.all([getSiteContent(), getCatalogue()]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return (
    <div>
      <p className="label-wide text-text2">Outfits</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Shop the look</h1>
      <p className="mt-2 max-w-xl text-text2">Full outfits put together by our team. Pick your sizes and add the whole look, or swap a piece.</p>
      {site.looks.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-text2">Looks are on their way. Meanwhile, <Link href="/drip-school" className="font-semibold text-navy underline">get outfit ideas in Drip School</Link>.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {site.looks.map((l) => (
            <Link key={l.slug} href={`/looks/${l.slug}`} className="card group block overflow-hidden">
              <div className="grid grid-cols-3 gap-1 p-1">
                {l.items.slice(0, 3).map((i) => { const p = bySlug.get(i.slug); return p ? <div key={i.slug} className="aspect-[4/5] overflow-hidden rounded-[10px]"><ProductPhoto product={p} sizes="200px" className="transition group-hover:scale-105" /></div> : null; })}
              </div>
              <div className="p-4"><p className="text-xs font-semibold uppercase text-text2">{l.occasion ?? "Look"}</p><h2 className="text-lg font-semibold">{l.title}</h2>{l.intro && <p className="text-sm text-text2">{l.intro}</p>}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
