"use client";

import Link from "next/link";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductCard } from "@/components/store/ProductCard";
import type { Product } from "@/lib/catalogue/types";
import { useNow } from "@/lib/now";
import { useRecent, useStyleProfile } from "@/lib/personal";

/**
 * The home page row that uses the style quiz (FR-JR-009) and what the shopper looked at recently: products in their sizes,
 * their audience, their style tags and budget. Without either, it invites them to take the quiz instead.
 */
export function PickedForYou({ title }: { title: string }) {
  const { products, get } = useCatalogue();
  const profile = useStyleProfile();
  const recent = useRecent();
  const now = useNow() ?? 0;
  const buyable = products.filter((p) => !p.releaseAt || (now > 0 && Date.parse(p.releaseAt) <= now));

  if (!profile && recent.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[24px] bg-lime p-6 text-navy md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <p className="text-xl font-extrabold uppercase md:text-2xl">Find your Drezzy style</p>
          <p className="mt-1 text-sm">Six quick questions. We remember your sizes and show you looks that fit.</p>
        </div>
        <Link href="/style-quiz" className="btn-primary">Take the style quiz</Link>
      </section>
    );
  }

  const score = (p: Product) => {
    let n = p.popular / 100;
    if (profile) {
      if (profile.audience && profile.audience !== "Both" && (p.audience === profile.audience || p.audience === "Men and ladies" || p.audience === "Unisex")) n += 2;
      if (profile.shoe_size && p.sizes.some((s) => s.size === profile.shoe_size && s.availability !== "Unavailable")) n += 3;
      if (profile.clothing_size && p.sizes.some((s) => s.size.toUpperCase() === profile.clothing_size && s.availability !== "Unavailable")) n += 2;
      if (profile.budget && p.price <= profile.budget) n += 1;
      n += (p.tags ?? []).filter((t) => profile.tags.includes(t)).length * 2;
    }
    const recentCats = recent.map((s) => get(s)?.category).filter(Boolean);
    if (recentCats.includes(p.category)) n += 1;
    return n;
  };
  const picks = buyable.filter((p) => !recent.slice(0, 2).includes(p.slug)).map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.p);
  const seen = recent.map((s) => get(s)).filter((p): p is Product => !!p).slice(0, 4);

  return (
    <>
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-bold md:text-[30px]">{title}</h2>
          <Link href="/style-quiz" className="text-sm font-semibold text-navy underline">{profile ? "Retake the quiz" : "Take the style quiz"}</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{picks.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
      </section>
      {seen.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[22px] font-bold md:text-[30px]">Recently viewed</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{seen.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
        </section>
      )}
    </>
  );
}
