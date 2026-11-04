"use client";

import { useMemo, useState } from "react";
import { useCatalogue } from "@/components/CatalogueProvider";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/store/ProductCard";
import { compareSizes } from "@/lib/catalogue/build";
import type { Product } from "@/lib/catalogue/types";
import { formatGHS } from "@/lib/data";
import { searchProducts } from "@/lib/search";

type Sort = "newest" | "price-asc" | "price-desc" | "popular";

type Filters = {
  category: string;
  audience: string[];
  brands: string[];
  sizes: string[];
  colours: string[];
  maxPrice: number | null;
  availableOnly: boolean;
};

type Facets = { brands: string[]; sizes: string[]; colours: string[]; priceCap: number };

function facetsOf(products: Product[]): Facets {
  return {
    brands: [...new Set(products.map((p) => p.brand))].sort(),
    sizes: [...new Set(products.flatMap((p) => p.sizes.map((s) => s.size)))].sort(compareSizes),
    colours: [...new Set(products.flatMap((p) => p.colours))].sort(),
    priceCap: Math.max(50, ...products.map((p) => p.price)),
  };
}

const empty = (category: string): Filters => ({ category, audience: [], brands: [], sizes: [], colours: [], maxPrice: null, availableOnly: false });

function matches(p: Product, f: Filters) {
  if (f.category === "Ladies sneakers") {
    if (!(p.category === "Sneakers" && (p.audience === "Ladies" || p.audience === "Men and ladies"))) return false;
  } else if (f.category !== "All" && p.category !== f.category) return false;

  if (f.audience.length && !f.audience.some((a) => (a === "Men" ? /Men/.test(p.audience) : /ladies|Ladies/.test(p.audience)) || p.audience === "Unisex")) return false;
  if (f.brands.length && !f.brands.includes(p.brand)) return false;
  if (f.sizes.length && !p.sizes.some((s) => f.sizes.includes(s.size) && s.availability !== "Unavailable")) return false;
  if (f.colours.length && !p.colours.some((c) => f.colours.includes(c))) return false;
  if (f.maxPrice !== null && p.price > f.maxPrice) return false;
  if (f.availableOnly && !p.sizes.some((s) => s.availability === "Available")) return false;
  return true;
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`chip min-h-10 px-4 text-sm transition-colors ${on ? "bg-navy text-white" : "border border-line bg-white text-navy hover:border-navy"}`}
    >
      {children}
    </button>
  );
}

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function FilterPanel({ f, set, facets }: { f: Filters; set: (n: Filters) => void; facets: Facets }) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">For</legend>
        <div className="flex flex-wrap gap-2">
          {["Men", "Ladies"].map((a) => <Toggle key={a} on={f.audience.includes(a)} onClick={() => set({ ...f, audience: toggleIn(f.audience, a) })}>{a}</Toggle>)}
        </div>
      </fieldset>
      {facets.colours.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {facets.colours.map((c) => <Toggle key={c} on={f.colours.includes(c)} onClick={() => set({ ...f, colours: toggleIn(f.colours, c) })}>{c}</Toggle>)}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Brand</legend>
        <div className="flex flex-wrap gap-2">
          {facets.brands.map((b) => <Toggle key={b} on={f.brands.includes(b)} onClick={() => set({ ...f, brands: toggleIn(f.brands, b) })}>{b}</Toggle>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Size</legend>
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((s) => <Toggle key={s} on={f.sizes.includes(s)} onClick={() => set({ ...f, sizes: toggleIn(f.sizes, s) })}>{s}</Toggle>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 flex justify-between text-sm font-semibold">
          <span>Max price</span>
          <span className="font-normal text-text2">{formatGHS(f.maxPrice ?? facets.priceCap)}</span>
        </legend>
        <input
          type="range"
          min={50}
          max={facets.priceCap}
          step={10}
          value={f.maxPrice ?? facets.priceCap}
          onChange={(e) => set({ ...f, maxPrice: Number(e.target.value) >= facets.priceCap ? null : Number(e.target.value) })}
          aria-label="Maximum price"
          className="w-full accent-[#00115b]"
        />
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={f.availableOnly} onChange={(e) => set({ ...f, availableOnly: e.target.checked })} className="size-5 accent-[#00115b]" />
        Show available items only
      </label>
    </div>
  );
}

export function ShopBrowser({ initialCategory, initialQuery }: { initialCategory: string; initialQuery: string }) {
  const { products } = useCatalogue();
  const facets = useMemo(() => facetsOf(products), [products]);
  const categoryTabs = useMemo(() => {
    // the five categories always show, even before a category has products
    const known = ["Sneakers", "Shoes", "Shirts", "Loafers", "Watches"];
    return ["All", ...known, ...[...new Set(products.map((p) => p.category))].filter((c) => !known.includes(c))];
  }, [products]);
  const [f, setF] = useState<Filters>(empty(categoryTabs.includes(initialCategory) ? initialCategory : "All"));
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState(initialQuery);
  const [sheet, setSheet] = useState(false);

  const list = useMemo(() => {
    const base = query.trim() ? searchProducts(products, query) : products;
    const out = base.filter((p) => matches(p, f));
    const sorted = [...out];
    if (!query.trim() || sort !== "newest") {
      sorted.sort((a, b) =>
        sort === "price-asc" ? a.price - b.price
        : sort === "price-desc" ? b.price - a.price
        : sort === "popular" ? b.popular - a.popular
        : Number(!!b.isNew) - Number(!!a.isNew) || b.popular - a.popular,
      );
    }
    return sorted;
  }, [f, sort, query, products]);

  const chips: { label: string; clear: () => void }[] = [
    ...(query.trim() ? [{ label: `“${query}”`, clear: () => setQuery("") }] : []),
    ...f.audience.map((a) => ({ label: a, clear: () => setF({ ...f, audience: toggleIn(f.audience, a) }) })),
    ...f.brands.map((b) => ({ label: b, clear: () => setF({ ...f, brands: toggleIn(f.brands, b) }) })),
    ...f.sizes.map((s) => ({ label: `Size ${s}`, clear: () => setF({ ...f, sizes: toggleIn(f.sizes, s) }) })),
    ...(f.maxPrice !== null ? [{ label: `Up to ${formatGHS(f.maxPrice)}`, clear: () => setF({ ...f, maxPrice: null }) }] : []),
    ...(f.availableOnly ? [{ label: "Available only", clear: () => setF({ ...f, availableOnly: false }) }] : []),
  ];
  const reset = () => {
    setF(empty("All"));
    setQuery("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold md:text-[40px]">{f.category === "All" ? "Shop all" : f.category}</h1>
          <p className="text-sm text-text2" aria-live="polite">{list.length} {list.length === 1 ? "item" : "items"}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text2">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-[12px] border border-line bg-white px-3 font-medium">
            <option value="newest">Newest</option>
            <option value="popular">Most popular</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Categories">
        {categoryTabs.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={f.category === c}
            type="button"
            onClick={() => setF({ ...f, category: c })}
            className={`chip min-h-11 shrink-0 px-5 text-sm transition-colors ${f.category === c ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setSheet(true)} className="btn-outline !min-h-11 lg:hidden"><Icon name="filter" size={18} /> Filters{chips.length > 0 && ` (${chips.length})`}</button>
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={c.clear} className="chip min-h-9 gap-1.5 bg-lime pl-3 pr-2 text-navy" aria-label={`Remove filter ${c.label}`}>
            {c.label} <Icon name="close" size={14} />
          </button>
        ))}
        {chips.length > 0 && <button type="button" onClick={reset} className="text-sm text-text2 underline">Clear all</button>}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="card sticky top-32 p-5"><FilterPanel f={f} set={setF} facets={facets} /></div>
        </aside>

        <div>
          {list.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-card text-navy"><Icon name="search" size={26} /></span>
              <p className="text-lg font-semibold">{products.some((p) => p.category === f.category) || f.category === "All" ? "Nothing matches that yet" : `New ${f.category.toLowerCase()} are on the way`}</p>
              <p className="max-w-sm text-sm text-text2">Try removing a filter, or ask us on WhatsApp. We can source most pairs on request.</p>
              <button type="button" onClick={reset} className="btn-primary mt-1">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-3">
              {list.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[24px] bg-page">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold">Filters</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close filters" className="flex size-10 items-center justify-center rounded-full hover:bg-card"><Icon name="close" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><FilterPanel f={f} set={setF} facets={facets} /></div>
            <div className="grid grid-cols-2 gap-3 border-t border-line bg-white p-4">
              <button type="button" onClick={reset} className="btn-outline">Clear all</button>
              <button type="button" onClick={() => setSheet(false)} className="btn-primary">Show {list.length}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
