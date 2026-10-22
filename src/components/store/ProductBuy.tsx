"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { WishlistButton } from "@/components/store/WishlistButton";
import { variantsFor } from "@/lib/catalogue/build";
import type { Availability, Product } from "@/lib/catalogue/types";
import { addToCart, setRegion, useCart } from "@/lib/cart";
import { branches, formatGHS, getZone, zones } from "@/lib/data";

const swatch = (name: string) => {
  const n = name.toLowerCase();
  const map: [string, string][] = [
    ["black", "#14161f"], ["white", "#f4f4f6"], ["purple", "#6b3fa0"], ["brown", "#7a4a2b"], ["red", "#b3172b"],
    ["navy", "#00115b"], ["blue", "#0036ff"], ["grey", "#9aa0b4"], ["indigo", "#2b4a8c"], ["green", "#12805c"],
  ];
  return map.find(([k]) => n.includes(k))?.[1] ?? "#9a9fb2";
};

const tag: Record<Availability, string> = {
  Available: "",
  Limited: "Limited at our supplier",
  Unavailable: "Unavailable",
  "Pre-order": "Pre-order",
};

export function ProductBuy({ product: p }: { product: Product }) {
  const [style, setStyle] = useState(p.styles?.[0]);
  const [colour, setColour] = useState(p.colours[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [shared, setShared] = useState(false);
  const { region } = useCart();

  const zone = getZone(region);
  // The sizes, price and lead time depend on the style and colour picked: each combination is its own variant.
  const options = variantsFor(p, { style, colour });
  const open = (sz: string) => options.some((v) => v.size === sz && v.availability !== "Unavailable");
  const size = chosen && open(chosen) ? chosen : options.length === 1 && options[0].availability !== "Unavailable" ? options[0].size : null;
  const picked = options.find((v) => v.size === size);
  const shownPrice = picked?.price ?? Math.min(...options.map((v) => v.price));
  const shownCompare = picked ? picked.compareAt : options.find((v) => v.price === shownPrice)?.compareAt;
  const sizeWord = /sneaker|shoe|slide|sandal/i.test(p.category) ? "EU" : "";
  const days = (picked?.leadDays ?? Math.min(...options.map((v) => v.leadDays))) + (zone?.days ?? 0);
  const branch = region === "Ashanti" ? branches.kumasi : branches.accra;

  // built on click so the page link can be included without a server/client mismatch
  function askOnWhatsApp() {
    const text = `Hi Drezzy, I'm asking about ${p.name}${style ? ` (${style})` : ""}, ${colour}${size ? `, size ${size}` : ""}. ${window.location.href}`;
    window.open(`https://wa.me/${branch.wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function add() {
    if (!size) {
      setHint(true);
      document.getElementById("size-block")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    addToCart(p, { size, colour, style });
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  }

  const chip = (on: boolean) =>
    `chip min-h-11 cursor-pointer px-5 text-sm transition-colors ${on ? "bg-navy text-white" : "border border-line bg-white text-ink hover:border-navy"}`;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text2">{p.brand}</p>
          <h1 className="text-[28px] font-bold leading-tight md:text-[34px]">{p.name}</h1>
        </div>
        <div className="flex gap-2">
          <WishlistButton slug={p.slug} name={p.name} className="border border-line" />
          <button type="button" onClick={share} aria-label="Share this product" className="relative flex size-10 items-center justify-center rounded-full border border-line bg-white text-navy">
            <Icon name="arrow" size={18} className="-rotate-45" />
            {shared && <span className="absolute -bottom-7 right-0 whitespace-nowrap rounded bg-ink px-2 py-0.5 text-xs text-white">Link copied</span>}
          </button>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-2xl font-semibold">
        {!picked && p.priceVaries && <span className="text-base font-normal text-text2">From</span>}
        {formatGHS(shownPrice)}
        {shownCompare && shownCompare > shownPrice && <span className="text-base font-normal text-text2 line-through">{formatGHS(shownCompare)}</span>}
        <span className="chip bg-lime text-navy">Brand new, original</span>
      </p>

      {p.styles && (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Style: <span className="font-normal text-text2">{style}</span></legend>
          <div className="mt-2 flex gap-2">
            {p.styles.map((s) => (
              <button key={s} type="button" onClick={() => setStyle(s)} aria-pressed={style === s} className={chip(style === s)}>{s}</button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold">Colour: <span className="font-normal text-text2">{colour}</span></legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {p.colours.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              aria-pressed={colour === c}
              aria-label={c}
              title={c}
              className={`size-11 rounded-full border-2 p-1 transition ${colour === c ? "border-navy" : "border-transparent hover:border-line"}`}
            >
              <span className="block size-full rounded-full ring-1 ring-black/10" style={{ background: swatch(c) }} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset id="size-block" className="mt-6">
        <legend className="flex w-full items-center justify-between text-sm font-semibold">
          <span>Size {sizeWord && `(${sizeWord})`}{size && <span className="font-normal text-text2">: {size}</span>}</span>
          <Link href="/help/size-guide" className="text-navy underline">Size guide</Link>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
          {options.map((v) => {
            const out = v.availability === "Unavailable";
            const on = size === v.size;
            return (
              <button
                key={v.size}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={out}
                disabled={out}
                title={out ? "Unavailable" : tag[v.availability] || "Available"}
                onClick={() => {
                  setChosen(v.size);
                  setHint(false);
                }}
                className={`relative flex h-12 min-w-12 items-center justify-center rounded-[12px] border px-3 text-sm font-medium transition-colors ${
                  out
                    ? "cursor-not-allowed border-line bg-card text-muted line-through"
                    : on
                      ? "border-navy bg-navy text-white"
                      : "border-line bg-white text-navy hover:border-navy"
                }`}
              >
                {v.size}
                {v.availability === "Limited" && !on && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-warning ring-2 ring-page" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {hint && !size && <p role="alert" className="mt-2 text-sm font-medium text-error">Choose a size to add this to your bag.</p>}
        {picked?.availability === "Limited" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-warning"><Icon name="clock" size={16} /> Limited at our supplier in {sizeWord} {picked.size}. Order soon.</p>
        )}
      </fieldset>

      <section className="card mt-6 p-4 text-sm" aria-label="Delivery estimate">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold"><Icon name="truck" size={18} /> Delivery to</p>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Delivery region"
            className="rounded-[12px] border border-line bg-white px-3 py-2 text-sm font-medium"
          >
            {zones.map((z) => <option key={z.region}>{z.region}</option>)}
          </select>
        </div>
        <p className="mt-2 text-text2">
          About {days} {days === 1 ? "day" : "days"}, including getting it from our supplier · Fee {zone ? formatGHS(zone.fee) : "at checkout"}
          {" · "}{zone?.accra ? "Pay in full or half now, half on delivery" : "Paid in full at checkout outside Accra"}
        </p>
      </section>

      <div className="mt-6 hidden gap-3 md:grid">
        <button type="button" onClick={add} className="btn-primary">
          <Icon name="bag" size={20} /> {size ? `Add to bag · ${sizeWord} ${size}` : "Select a size"}
        </button>
        <button type="button" onClick={askOnWhatsApp} className="btn-outline"><Icon name="chat" size={20} /> Ask about this on WhatsApp</button>
      </div>
      <div className="mt-6 md:hidden">
        <button type="button" onClick={askOnWhatsApp} className="btn-outline w-full"><Icon name="chat" size={20} /> Ask about this on WhatsApp</button>
      </div>

      {/* sticky add-to-bag bar, phones only (UX principle 2) */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none">{formatGHS(shownPrice)}</p>
            <p className="mt-1 truncate text-xs text-text2">{size ? `${sizeWord} ${size} · ${colour}` : "Select a size"}</p>
          </div>
          <button type="button" onClick={add} className="btn-primary flex-1">Add to bag</button>
        </div>
      </div>
    </>
  );
}
