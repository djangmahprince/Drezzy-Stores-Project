"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductArt } from "@/components/ProductArt";
import type { Article } from "@/lib/articles/server";

const tabs = ["All", "Outfit guide", "Trends", "How-to"];

export function DripBrowser({ articles }: { articles: Article[] }) {
  const [tab, setTab] = useState("All");
  const list = articles.filter((a) => tab === "All" || a.type === tab);
  const [featured, ...rest] = list;
  const art = (a: Article) => (
    <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label="" className="transition duration-300 group-hover:scale-105" />
  );

  return (
    <div>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Story types">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`chip min-h-11 shrink-0 px-5 text-sm ${tab === t ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>
            {t === "Outfit guide" ? "Outfit guides" : t}
          </button>
        ))}
      </div>

      {featured ? (
        <>
          <Link href={`/drip-school/${featured.slug}`} className="card group mt-6 block overflow-hidden md:grid md:grid-cols-[1.4fr_1fr]">
            <div className="aspect-[16/9] overflow-hidden md:aspect-auto md:min-h-72">{art(featured)}</div>
            <div className="flex flex-col justify-center p-5 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-text2">{featured.type} · {featured.minutes} min read</p>
              <h2 className="mt-2 text-[22px] font-bold leading-tight md:text-[30px]">{featured.title}</h2>
              <span className="mt-4 text-sm font-semibold text-navy underline">Read the guide</span>
            </div>
          </Link>
          {rest.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {rest.map((a) => (
                <Link key={a.slug} href={`/drip-school/${a.slug}`} className="card group block overflow-hidden">
                  <div className="aspect-[16/9] overflow-hidden">{art(a)}</div>
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase text-text2">{a.type} · {a.minutes} min</p>
                    <h3 className="mt-1 font-semibold">{a.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="card mt-6 p-8 text-center text-text2">Nothing here yet. New stories land every week.</p>
      )}
    </div>
  );
}
