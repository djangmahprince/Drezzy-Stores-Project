"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ProductArt } from "@/components/ProductArt";
import type { Art } from "@/lib/catalogue/types";
import { viewed } from "@/lib/personal";

/**
 * The product gallery (FR-SF-003): 4:5 photos with thumbnails, a short video, and tap-to-zoom. Products without photos yet
 * show the stand-in artwork. Videos never autoplay with sound and only load when chosen (low bandwidth, PRD section 21).
 */
export function ProductGallery({ slug, name, art, images, video, badges }: { slug: string; name: string; art: Art; images: string[]; video?: string; badges: React.ReactNode }) {
  const media = [...images.map((src) => ({ kind: "image" as const, src })), ...(video ? [{ kind: "video" as const, src: video }] : [])];
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => viewed(slug), [slug]);
  useEffect(() => {
    if (!zoom) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [zoom]);
  const current = media[i];

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-white shadow-[0_8px_30px_rgba(0,17,91,0.12)]">
        {!current ? (
          <ProductArt {...art} label={`${name}, product image`} />
        ) : current.kind === "image" ? (
          <button type="button" onClick={() => setZoom(true)} className="relative block size-full cursor-zoom-in" aria-label="Zoom in on the photo">
            <Image src={current.src} alt={`${name}, photo ${i + 1} of ${images.length}`} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" priority={i === 0} />
          </button>
        ) : (
          <video src={current.src} controls playsInline preload="none" className="size-full object-cover" aria-label={`${name}, video`} />
        )}
        <div className="pointer-events-none absolute left-4 top-4 flex gap-2">{badges}</div>
      </div>
      {media.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Photos">
          {media.map((m, n) => (
            <button key={m.src} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)}
              className={`relative size-16 shrink-0 overflow-hidden rounded-[10px] border-2 ${n === i ? "border-navy" : "border-transparent"}`}>
              {m.kind === "image" ? <Image src={m.src} alt="" fill sizes="64px" className="object-cover" /> : <span className="flex size-full items-center justify-center bg-navy text-xs font-bold text-lime">▶ Video</span>}
            </button>
          ))}
        </div>
      )}
      {zoom && current?.kind === "image" && (
        <div role="dialog" aria-modal="true" aria-label="Zoomed photo" className="fixed inset-0 z-[60] overflow-auto bg-ink/90" onClick={() => setZoom(false)}>
          <button type="button" className="fixed right-4 top-4 z-10 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy" onClick={() => setZoom(false)}>Close</button>
          {/* the photo at full width: pinch to zoom further on a phone */}
          <div className="relative mx-auto aspect-[4/5] w-[min(100vw,1200px)]">
            <Image src={current.src} alt={name} fill sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
