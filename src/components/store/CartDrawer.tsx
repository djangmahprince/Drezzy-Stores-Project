"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { ProductArt } from "@/components/ProductArt";
import { closeDrawer, computeTotals, removeLine, setQty, usePricedCart, useDrawerOpen } from "@/lib/cart";
import { formatGHS, getZone } from "@/lib/data";

export function QtyStepper({ qty, onChange, label }: { qty: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-[12px] border border-line bg-white" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="flex size-10 items-center justify-center text-navy" onClick={() => onChange(qty - 1)} aria-label="Decrease quantity">
        <Icon name="minus" size={16} />
      </button>
      <span className="w-6 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
      <button
        type="button"
        className="flex size-10 items-center justify-center text-navy disabled:opacity-40"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= 10}
        aria-label="Increase quantity"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

export function CartDrawer() {
  const open = useDrawerOpen();
  const { region, priced } = usePricedCart();
  const t = computeTotals(priced, region, "home", "full");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={closeDrawer}
        className={`absolute inset-0 bg-ink/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-page shadow-2xl transition-transform duration-250 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <h2 className="text-lg font-bold">Your bag {priced.length > 0 && <span className="text-text2">({priced.reduce((s, l) => s + l.qty, 0)})</span>}</h2>
          <button type="button" onClick={closeDrawer} aria-label="Close bag" className="flex size-10 items-center justify-center rounded-full hover:bg-card">
            <Icon name="close" />
          </button>
        </header>

        {priced.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-white text-navy"><Icon name="bag" size={28} /></span>
            <p className="text-lg font-semibold">Your bag is empty. Let&apos;s fix that.</p>
            <Link href="/shop" onClick={closeDrawer} className="btn-primary">Shop sneakers</Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-3 overflow-y-auto p-4">
              {priced.map((l) => (
                <li key={l.key} className="card flex gap-3 p-3">
                  <Link href={`/product/${l.slug}`} onClick={closeDrawer} className="size-20 shrink-0 overflow-hidden rounded-[12px]">
                    <ProductArt {...l.product.art} label={l.product.name} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{l.product.name}</p>
                    <p className="text-xs text-text2">
                      {[l.style, l.colour, l.size !== "One size" ? `EU/size ${l.size}` : null].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <QtyStepper qty={l.qty} onChange={(n) => setQty(l.key, n)} label={l.product.name} />
                      <p className="font-semibold">{formatGHS(l.lineTotal)}</p>
                    </div>
                    <button type="button" onClick={() => removeLine(l.key)} className="mt-1 text-xs text-text2 underline">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="space-y-3 border-t border-line bg-white p-4">
              <div className="space-y-1 text-sm">
                <p className="flex justify-between"><span>Subtotal</span><span>{formatGHS(t.subtotal)}</span></p>
                <p className="flex justify-between text-text2">
                  <span>Delivery to {region}</span>
                  <span>{getZone(region) ? formatGHS(t.fee) : "Confirmed at checkout"}</span>
                </p>
                <p className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{formatGHS(t.total)}</span></p>
              </div>
              <Link href="/checkout" onClick={closeDrawer} className="btn-primary w-full">Checkout</Link>
              <Link href="/cart" onClick={closeDrawer} className="btn-outline w-full">View bag</Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
