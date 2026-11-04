"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductPhoto } from "@/components/ProductPhoto";
import { formatGHS } from "@/lib/data";
import { searchProducts, suggestions } from "@/lib/search";
import { track } from "@/lib/track";

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { products } = useCatalogue();
  const results = searchProducts(products, q);

  // what people search for, and searches that found nothing, feed the product report (FR-AN-005, FR-AN-009)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(() => track("search", { term: term.slice(0, 60), results: searchProducts(products, term).length }), 1200);
    return () => window.clearTimeout(t);
  }, [q, products]);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-page" role="dialog" aria-modal="true" aria-label="Search">
      <div className="mx-auto flex h-full max-w-2xl flex-col px-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
            onClose();
          }}
          className="flex items-center gap-2 py-3"
        >
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by model, brand or SKU"
              aria-label="Search products"
              className="field pl-11"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <button type="button" onClick={onClose} className="btn-outline" aria-label="Close search">Cancel</button>
        </form>

        <div className="flex-1 overflow-y-auto pb-8">
          {q.trim() === "" ? (
            <>
              <p className="label-wide mb-3 text-text2">Popular</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setQ(s)} className="chip min-h-10 border border-line bg-white px-4 text-sm text-navy">{s}</button>
                ))}
              </div>
            </>
          ) : results.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-lg font-semibold">Nothing matches &ldquo;{q}&rdquo;</p>
              <p className="mt-1 text-sm text-text2">Check the spelling, or try one of these.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setQ(s)} className="chip min-h-10 border border-line bg-white px-4 text-sm text-navy">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-2" aria-live="polite">
              <li className="text-sm text-text2">{results.length} {results.length === 1 ? "result" : "results"}</li>
              {results.map((p) => (
                <li key={p.slug}>
                  <Link href={`/product/${p.slug}`} onClick={onClose} className="card flex items-center gap-3 p-2 hover:border-navy">
                    <span className="size-16 shrink-0 overflow-hidden rounded-[12px]"><ProductPhoto product={p} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold uppercase text-text2">{p.brand}</span>
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                    </span>
                    <span className="pr-2 text-sm font-semibold">{formatGHS(p.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
