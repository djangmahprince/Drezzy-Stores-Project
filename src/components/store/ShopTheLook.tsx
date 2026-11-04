"use client";

import { useState } from "react";
import { useCatalogue } from "@/components/CatalogueProvider";
import { Icon } from "@/components/Icon";
import { ProductPhoto } from "@/components/ProductPhoto";
import { variantsFor } from "@/lib/catalogue/build";
import { addToCart } from "@/lib/cart";
import { formatGHS } from "@/lib/data";

export type LookItem = { slug: string; style?: string };

/** An outfit made of catalogue products. Items that are no longer in the catalogue are skipped, and with fewer than two the module hides. */
export function ShopTheLook({ items }: { items: LookItem[] }) {
  const { get } = useCatalogue();
  const rows = items.flatMap((i) => {
    const product = get(i.slug);
    if (!product) return [];
    const style = i.style && product.styles?.includes(i.style) ? i.style : product.styles?.[0];
    const colour = product.colours[0];
    const options = variantsFor(product, { style, colour });
    return options.length ? [{ ...i, style, colour, product, options, price: Math.min(...options.map((v) => v.price)) }] : [];
  });

  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [warn, setWarn] = useState(false);

  if (rows.length < 2) return null;

  // a size is "chosen" when it is still on offer; one-size items are chosen for the customer
  const sizeOf = (r: (typeof rows)[number]) => {
    const s = sizes[r.slug];
    if (s && r.options.some((v) => v.size === s && v.availability !== "Unavailable")) return s;
    return r.options.length === 1 && r.options[0].availability !== "Unavailable" ? r.options[0].size : "";
  };
  const total = rows.reduce((sum, r) => sum + (r.options.find((v) => v.size === sizeOf(r))?.price ?? r.price), 0);
  const missing = rows.filter((r) => !sizeOf(r)).length;

  function addAll() {
    if (missing) {
      setWarn(true);
      return;
    }
    rows.forEach((r) => addToCart(r.product, { size: sizeOf(r), colour: r.colour, style: r.style }));
  }

  return (
    <div className="hero-card my-8 p-4 text-base md:p-6">
      <p className="label-wide text-text2">Shop the look</p>
      <ul className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <li key={r.slug} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
            <span className="size-16 shrink-0 overflow-hidden rounded-[12px]"><ProductPhoto product={r.product} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{r.product.name}{r.style ? ` ${r.style}` : ""}</span>
              <span className="block text-sm text-text2">{formatGHS(r.price)}</span>
            </span>
            {r.options.length > 1 ? (
              <select
                value={sizeOf(r)}
                onChange={(e) => {
                  setSizes((s) => ({ ...s, [r.slug]: e.target.value }));
                  setWarn(false);
                }}
                aria-label={`Size for ${r.product.name}`}
                className={`min-h-11 rounded-[12px] border bg-white px-2 text-sm ${warn && !sizeOf(r) ? "border-error" : "border-line"}`}
              >
                <option value="">Size</option>
                {r.options.map((v) => <option key={v.size} value={v.size} disabled={v.availability === "Unavailable"}>{v.size}</option>)}
              </select>
            ) : (
              <span className="chip bg-card text-text2">One size</span>
            )}
          </li>
        ))}
      </ul>
      {warn && missing > 0 && <p role="alert" className="mt-3 text-sm font-medium text-error">Choose a size for {missing === 1 ? "1 item" : `${missing} items`} to add the look.</p>}
      <button type="button" onClick={addAll} className="btn-primary mt-4 w-full">
        <Icon name="bag" size={20} /> Add all {rows.length} to bag · {formatGHS(total)}
      </button>
    </div>
  );
}
