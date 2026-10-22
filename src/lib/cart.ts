"use client";

import { useCatalogue } from "@/components/CatalogueProvider";
import { findVariant } from "@/lib/catalogue/build";
import type { Product } from "@/lib/catalogue/types";
import type { Zone } from "@/lib/data";
import { createStore, useStore } from "@/lib/store";

export type CartLine = {
  key: string;
  slug: string;
  size: string;
  colour: string;
  style?: string;
  qty: number;
};

type CartState = { lines: CartLine[]; region: string };

const cart = createStore<CartState>({ lines: [], region: "Greater Accra" }, "drezzy.cart.v1");
const drawer = createStore({ open: false });
const wishlist = createStore<{ slugs: string[] }>({ slugs: [] }, "drezzy.wishlist.v1");

export const lineKey = (slug: string, size: string, colour: string, style?: string) =>
  [slug, style ?? "", colour, size].join("|");

export function addToCart(p: Product, pick: { size: string; colour: string; style?: string }, qty = 1) {
  const key = lineKey(p.slug, pick.size, pick.colour, pick.style);
  cart.set((s) => {
    const existing = s.lines.find((l) => l.key === key);
    const lines = existing
      ? s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + qty, 10) } : l))
      : [...s.lines, { key, slug: p.slug, size: pick.size, colour: pick.colour, style: pick.style, qty }];
    return { ...s, lines };
  });
  drawer.set({ open: true });
}

export const setQty = (key: string, qty: number) =>
  cart.set((s) => ({
    ...s,
    lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, 10) } : l)),
  }));

export const removeLine = (key: string) => setQty(key, 0);
export const clearCart = () => cart.set((s) => ({ ...s, lines: [] }));
export const setRegion = (region: string) => cart.set((s) => ({ ...s, region }));
export const openDrawer = () => drawer.set({ open: true });
export const closeDrawer = () => drawer.set({ open: false });

export const useCart = () => useStore(cart);
export const useDrawerOpen = () => useStore(drawer).open;
export const useWishlist = () => useStore(wishlist).slugs;

export const toggleWishlist = (slug: string) =>
  wishlist.set((s) => ({ slugs: s.slugs.includes(slug) ? s.slugs.filter((x) => x !== slug) : [...s.slugs, slug] }));

export type PricedLine = CartLine & { product: Product; variantId?: string; unitPrice: number; lineTotal: number; leadDays: number };

/**
 * Prices each line from the variant the customer picked, so a style, colour or size that costs more is charged correctly.
 * A line whose product (or variant) has since disappeared from the catalogue is dropped rather than priced wrongly.
 */
export function priceLines(lines: CartLine[], lookup: (slug: string) => Product | undefined): PricedLine[] {
  return lines.flatMap((l) => {
    const product = lookup(l.slug);
    if (!product) return [];
    const v = findVariant(product, { style: l.style, colour: l.colour, size: l.size });
    if (!v) return [];
    return [{ ...l, product, variantId: v.id, unitPrice: v.price, lineTotal: v.price * l.qty, leadDays: v.leadDays }];
  });
}

/** The cart with prices worked out against the live catalogue. */
export function usePricedCart() {
  const cart = useCart();
  const { get } = useCatalogue();
  return { ...cart, priced: priceLines(cart.lines, get) };
}

export type Method = "home" | "pickup";
export type Plan = "full" | "half";

export type Totals = {
  subtotal: number;
  fee: number;
  total: number;
  canSplit: boolean;
  dueNow: number;
  dueLater: number;
  days: number;
};

/**
 * Payment rules from the PRD (section 9): Accra addresses (and Accra pickup) may pay half now and half on
 * delivery, everywhere else pays in full. The delivery fee is part of the amount paid at checkout.
 */
export function computeTotals(lines: PricedLine[], zone: Zone | undefined, method: Method, plan: Plan): Totals {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const fee = lines.length === 0 || method === "pickup" ? 0 : (zone?.fee ?? 0);
  const total = subtotal + fee;
  const canSplit = method === "pickup" || !!zone?.accra; // pickup is at the Accra branch, so it follows the Accra rule
  const half = canSplit && plan === "half";
  const dueNow = half ? Math.ceil(total / 2) : total;
  const lead = Math.max(0, ...lines.map((l) => l.leadDays));
  return { subtotal, fee, total, canSplit, dueNow, dueLater: total - dueNow, days: lead + (zone?.days ?? 0) };
}
