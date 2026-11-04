"use client";

import Link from "next/link";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductPhoto } from "@/components/ProductPhoto";
import { Countdown } from "@/components/store/Countdown";
import { useNow } from "@/lib/now";

/** Upcoming limited drops with a live countdown (FR-SF-010). Decided in the browser, where the current time is known. */
export function DropsRow({ title }: { title: string }) {
  const { products } = useCatalogue();
  const now = useNow();
  if (now === null) return null;
  const drops = products.filter((p) => p.releaseAt && Date.parse(p.releaseAt) > now).sort((a, b) => Date.parse(a.releaseAt!) - Date.parse(b.releaseAt!)).slice(0, 4);
  if (!drops.length) return null;
  return (
    <section className="rounded-[24px] bg-ink p-6 text-white md:p-8">
      <div className="flex items-baseline justify-between"><h2 className="text-[22px] font-bold md:text-[30px]">{title}</h2><Link href="/drops" className="text-sm font-semibold text-lime underline">Drop calendar</Link></div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {drops.map((p) => (
          <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
            <div className="aspect-[4/5] overflow-hidden rounded-[16px] ring-1 ring-white/15"><ProductPhoto product={p} label={p.name} sizes="300px" className="transition group-hover:scale-105" /></div>
            <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
            <p className="text-xs text-lime"><Countdown to={p.releaseAt!} /></p>
          </Link>
        ))}
      </div>
    </section>
  );
}
