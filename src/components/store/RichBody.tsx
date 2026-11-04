"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductArt } from "@/components/ProductArt";
import { ShopTheLook, type LookItem } from "@/components/store/ShopTheLook";
import { parseBody, slugFromTitle, type Block } from "@/lib/articles/format";
import { availabilitySummary } from "@/lib/catalogue/build";
import { formatGHS } from "@/lib/data";
import { publicFile } from "@/lib/media";
import { creditArticle, sessionId, track } from "@/lib/track";

/** A live product card inside an article (FR-JR-003): price and availability come from the catalogue. */
function ProductBlock({ slug, article }: { slug: string; article?: string }) {
  const { get } = useCatalogue();
  const p = get(slug);
  if (!p) return null;
  const a = availabilitySummary(p);
  const img = publicFile("media", p.images?.[0]);
  return (
    <div className="card my-4 flex items-center gap-4 p-3 text-base not-prose">
      <span className="relative size-16 shrink-0 overflow-hidden rounded-[12px]">{img ? <Image src={img} alt="" fill sizes="64px" className="object-cover" /> : <ProductArt {...p.art} label="" />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{p.name}</p>
        <p className="text-sm text-text2">{p.colours[0]} · <span className={`font-medium ${a.tone === "ok" ? "text-success" : a.tone === "warn" ? "text-warning" : "text-error"}`}>{a.label}</span> · {formatGHS(p.price)}</p>
      </div>
      <Link href={`/product/${p.slug}`} className="btn-outline !min-h-11" onClick={() => {
        if (!article) return;
        creditArticle(article);
        track("article_product_click", { article, product: p.slug });
        void fetch("/api/article-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: article, session: sessionId(), kind: "product_click", product: p.slug }) }).catch(() => {});
      }}>View</Link>
    </div>
  );
}

/** Videos load only when the reader taps them, so nothing third-party runs before then (FR-JR-005). */
function Embed({ b }: { b: Extract<Block, { t: "embed" }> }) {
  const [on, setOn] = useState(false);
  const src = b.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${b.id}?autoplay=1`
    : b.provider === "tiktok" ? `https://www.tiktok.com/embed/v2/${b.id}` : `https://www.instagram.com/p/${b.id}/embed`;
  const name = b.provider === "youtube" ? "YouTube" : b.provider === "tiktok" ? "TikTok" : "Instagram";
  return (
    <div className={`my-4 overflow-hidden rounded-[16px] bg-ink ${b.provider === "youtube" ? "aspect-video" : "aspect-[9/14] max-w-sm"}`}>
      {on ? (
        <iframe src={src} title={`${name} video`} className="size-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-white">
          <span className="flex size-14 items-center justify-center rounded-full bg-lime text-2xl text-navy">▶</span>
          <span className="font-semibold">Play the {name} video</span>
          <span className="text-xs text-white/70">Loads content from {name}. <a href={b.url} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>Open on {name}</a></span>
        </button>
      )}
    </div>
  );
}

function Img({ src, alt, small }: { src: string; alt: string; small?: boolean }) {
  const url = publicFile("media", src);
  if (!url) return null;
  return <span className={`relative block overflow-hidden rounded-[16px] ${small ? "aspect-square" : "aspect-[4/5] md:aspect-[16/10]"}`}><Image src={url} alt={alt} fill sizes={small ? "200px" : "(min-width: 768px) 700px, 100vw"} className="object-cover" /></span>;
}

export type LookData = { slug: string; title: string; items: LookItem[] };

/**
 * Renders article and page text written in the dashboard. Plain text with a few block markers (see lib/articles/format):
 * headings, lists, quotes, live product cards, Shop the Look, images, galleries and click-to-load video.
 */
export function RichBody({ body, article, looks = [], headingClass = "mt-8 text-[22px] font-bold" }: { body: string; article?: string; looks?: LookData[]; headingClass?: string }) {
  const blocks = parseBody(body);
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": return <h2 key={i} id={slugFromTitle(b.text) || undefined} className={`scroll-mt-32 ${headingClass}`}>{b.text}</h2>;
          case "ul": return <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
          case "quote": return <blockquote key={i} className="border-l-4 border-lime pl-4 text-lg font-medium italic">{b.text}</blockquote>;
          case "product": return <ProductBlock key={i} slug={b.slug} article={article} />;
          case "look": {
            const l = looks.find((x) => x.slug === b.slug);
            return l ? <div key={i}><p className="font-semibold">{l.title}</p><ShopTheLook items={l.items} /></div> : null;
          }
          case "embed": return <Embed key={i} b={b} />;
          case "img": return <figure key={i}><Img src={b.src} alt={b.alt} />{b.alt && <figcaption className="mt-1 text-sm text-text2">{b.alt}</figcaption>}</figure>;
          case "gallery": return <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-3">{b.srcs.map((s) => <Img key={s} src={s} alt="" small />)}</div>;
          default: return <p key={i}>{b.text}</p>;
        }
      })}
    </div>
  );
}
