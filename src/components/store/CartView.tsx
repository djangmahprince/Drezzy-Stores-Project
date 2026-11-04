"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ProductPhoto } from "@/components/ProductPhoto";
import { QtyStepper } from "@/components/store/CartDrawer";
import { computeTotals, removeLine, setQty, setRegion, usePricedCart } from "@/lib/cart";
import { useCatalogue } from "@/components/CatalogueProvider";
import { formatGHS } from "@/lib/data";

export function CartView() {
  const { region, priced } = usePricedCart();
  const { zones, zone: zoneOf } = useCatalogue();
  const zone = zoneOf(region);
  const t = computeTotals(priced, zone, "home", "full");

  if (priced.length === 0) {
    return (
      <div className="card mx-auto mt-4 flex max-w-lg flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-card text-navy"><Icon name="bag" size={30} /></span>
        <h1 className="text-[28px] font-bold">Your bag is empty. Let&apos;s fix that.</h1>
        <p className="text-text2">Sneakers, outfits and watches are one tap away.</p>
        <Link href="/shop" className="btn-primary mt-2">Start shopping</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold md:text-[40px]">Your bag</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="space-y-3">
          {priced.map((l) => (
            <li key={l.key} className="card flex gap-4 p-3 md:p-4">
              <Link href={`/product/${l.slug}`} className="size-24 shrink-0 overflow-hidden rounded-[12px] md:size-28">
                <ProductPhoto product={l.product} label={l.product.name} />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-text2">{l.product.brand}</p>
                    <Link href={`/product/${l.slug}`} className="font-medium leading-snug hover:underline">{l.product.name}</Link>
                    <p className="text-sm text-text2">{[l.style, l.colour, l.size !== "One size" ? `Size ${l.size}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="font-semibold">{formatGHS(l.lineTotal)}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <QtyStepper qty={l.qty} onChange={(n) => setQty(l.key, n)} label={l.product.name} />
                  <button type="button" onClick={() => removeLine(l.key)} className="text-sm text-text2 underline hover:text-error">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold">Order summary</h2>
            <label className="block text-sm">
              <span className="text-text2">Delivering to</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="field mt-1">
                {zones.map((z) => <option key={z.region}>{z.region}</option>)}
              </select>
            </label>
            <div className="space-y-2 border-t border-line pt-3 text-sm">
              <p className="flex justify-between"><span>Subtotal</span><span>{formatGHS(t.subtotal)}</span></p>
              <p className="flex justify-between text-text2"><span>Delivery{zone ? ` · about ${t.days} days` : ""}</span><span>{formatGHS(t.fee)}</span></p>
              <p className="flex justify-between border-t border-line pt-3 text-lg font-bold"><span>Total</span><span>{formatGHS(t.total)}</span></p>
            </div>
            <p className="rounded-[12px] bg-card p-3 text-xs leading-relaxed text-text2">
              {t.canSplit
                ? `Accra order: pay ${formatGHS(Math.ceil(t.total / 2))} now and the rest on delivery, or pay it all now.`
                : "Outside Accra, orders are paid in full at checkout, so we can source your item straight away."}
            </p>
            <Link href="/checkout" className="btn-primary w-full">Checkout</Link>
            <Link href="/shop" className="block text-center text-sm font-medium text-navy underline">Keep shopping</Link>
          </div>
          <p className="flex items-center justify-center gap-2 text-xs text-text2"><Icon name="shield" size={16} /> Pay with MoMo or card · secured by Paystack</p>
        </aside>
      </div>
    </div>
  );
}
