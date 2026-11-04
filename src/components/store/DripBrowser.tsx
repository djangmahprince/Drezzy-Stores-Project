"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ProductArt } from "@/components/ProductArt";
import type { Article } from "@/lib/articles/server";
import { publicFile } from "@/lib/media";

const tabs = ["All", "Outfit guide", "Trends", "How-to", "Occasion lookbook", "Drop news", "Customer spotlight", "Gift guide"];
const plural: Record<string, string> = { "Outfit guide": "Outfit guides", "Occasion lookbook": "Lookbooks", "Gift guide": "Gift guides", "Customer spotlight": "Spotlights" };

/** Drip School home (FR-JR-001): featured story, category tabs, search and tag filters. */
export function DripBrowser({ articles, initialTag = "" }: { articles: Article[]; initialTag?: string }) {
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState(initialTag);
  const types = tabs.filter((t) => t === "All" || articles.some((a) => a.type === t));
  const tags = [...new Set(articles.flatMap((a) => a.tags ?? []))].sort();
  const needle = q.trim().toLowerCase();
  const list = articles.filter((a) => (tab === "All" || a.type === tab) && (!tag || (a.tags ?? []).includes(tag))
    && (!needle || `${a.title} ${a.intro} ${(a.tags ?? []).join(" ")}`.toLowerCase().includes(needle)));
  const pinned = list.find((a) => a.featured);
  const [featured, ...rest] = pinned ? [pinned, ...list.filter((a) => a !== pinned)] : list;
  const art = (a: Article, sizes: string) => {
    const src = publicFile("media", a.hero_image);
    return src ? <Image src={src} alt="" fill sizes={sizes} className="object-cover transition duration-300 group-hover:scale-105" />
      : <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label="" className="transition duration-300 group-hover:scale-105" />;
  };

  return (
    <div>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides, trends and how-tos" aria-label="Search Drip School" className="field md:max-w-sm" />
        {tags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="field md:max-w-48">
            <option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <Link href="/drip-school/glossary" className="text-sm font-semibold text-navy underline md:ml-auto">Glossary</Link>
      </div>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Story types">
        {types.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`chip min-h-11 shrink-0 px-5 text-sm ${tab === t ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>
            {plural[t] ?? t}
          </button>
        ))}
      </div>

      {featured ? (
        <>
          <Link href={`/drip-school/${featured.slug}`} className="card group mt-6 block overflow-hidden md:grid md:grid-cols-[1.4fr_1fr]">
            <div className="relative aspect-[16/9] overflow-hidden md:aspect-auto md:min-h-72">{art(featured, "(min-width: 768px) 60vw, 100vw")}</div>
            <div className="flex flex-col justify-center p-5 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-text2">{featured.featured ? "Featured · " : ""}{featured.type} · {featured.minutes} min read</p>
              <h2 className="mt-2 text-[22px] font-bold leading-tight md:text-[30px]">{featured.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-text2">{featured.intro}</p>
              <span className="mt-4 text-sm font-semibold text-navy underline">Read the guide</span>
            </div>
          </Link>
          {rest.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {rest.map((a) => (
                <Link key={a.slug} href={`/drip-school/${a.slug}`} className="card group block overflow-hidden">
                  <div className="relative aspect-[16/9] overflow-hidden">{art(a, "(min-width: 768px) 33vw, 100vw")}</div>
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
        <p className="card mt-6 p-8 text-center text-text2">Nothing matches that. New stories land every week.</p>
      )}
    </div>
  );
}
