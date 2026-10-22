"use client";

import type { Method, Plan } from "@/lib/cart";
import { createStore, useStore } from "@/lib/store";

export type PlacedOrder = {
  id: string;
  placedAt: string; // ISO
  name: string;
  phone: string;
  email: string;
  region: string;
  city: string;
  area: string;
  method: Method;
  plan: Plan;
  payMethod: string;
  source: string;
  items: { name: string; detail: string; qty: number; price: number }[];
  total: number;
  paid: number;
  balance: number;
};

// Orders placed in this browser while checkout is a demo. Replaced by the orders table in the database.
const orders = createStore<{ list: PlacedOrder[]; counter: number }>({ list: [], counter: 1037 }, "drezzy.orders.v1");

export const useOrders = () => useStore(orders).list;

export function placeOrder(o: Omit<PlacedOrder, "id" | "placedAt">): PlacedOrder {
  let placed!: PlacedOrder;
  orders.set((s) => {
    placed = { ...o, id: `DRZ-${s.counter}`, placedAt: new Date().toISOString() };
    return { list: [placed, ...s.list], counter: s.counter + 1 };
  });
  return placed;
}

/** The last nine digits are enough to match 024..., +23324... and 23324... */
export const phoneKey = (p: string) => p.replace(/\D/g, "").slice(-9);

export const isGhanaPhone = (p: string) => {
  const d = p.replace(/[\s-]/g, "");
  return /^(\+233|233|0)\d{9}$/.test(d);
};

/** Remember an order that was placed for real, so this device can offer a tracking link and the return page can find the phone number. */
export function rememberOrder(o: PlacedOrder): PlacedOrder {
  orders.set((s) => ({ ...s, list: [o, ...s.list.filter((x) => x.id !== o.id)] }));
  return o;
}
