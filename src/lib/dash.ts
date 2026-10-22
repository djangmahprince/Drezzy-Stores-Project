"use client";

import { createStore, useStore } from "@/lib/store";

// Sample staff-side orders. Replaced by the orders table in the database in sprint 5.
import { stages, stageTitle, type DashOrder, type Status } from "@/lib/orders/dash-types";

export { stages, stageTitle };
export type { DashOrder, Status };

const order = (s: Status) => stages.findIndex((x) => x.id === s);

// Sample staff-side orders for the design preview. The real dashboard reads orders from the database.

const seed: DashOrder[] = [
  { id: "DRZ-1036", customer: "Esi", place: "East Legon, Accra", branch: "Accra", items: "Nike Dunk Low · Black / White · EU 39", channel: "Web", pay: "half", payNote: "Half paid · MoMo", total: 450, balance: 225, agent: "Akosua", status: "to_source", age: "Due today", log: [{ at: "9:14", text: "Half payment received" }], notes: [] },
  { id: "DRZ-1035", customer: "Kojo", place: "Takoradi", branch: "Accra", items: "New Balance 2000 · EU 41", channel: "WhatsApp", pay: "pending", payNote: "Manual MoMo · pending check", total: 480, balance: 0, agent: "Kwame", status: "awaiting_payment", age: "35 min", log: [{ at: "8:50", text: "Order created by Kwame from WhatsApp" }], notes: [] },
  { id: "DRZ-1034", customer: "Nana", place: "Madina, Accra", branch: "Accra", items: "Watch · Blue strap", channel: "Instagram DM", pay: "half", payNote: "Half paid · MoMo", total: 310, balance: 155, agent: "Akosua", status: "ready_to_pack", age: "15 min", log: [], notes: [] },
  { id: "DRZ-1033", customer: "Kojo", place: "Takoradi", branch: "Kumasi", items: "New Balance 2000 · EU 43", channel: "Web", pay: "paid", payNote: "Paid in full · Card", total: 480, balance: 0, agent: "Kwame", status: "to_source", age: "Due tomorrow", log: [], notes: [] },
  { id: "DRZ-1032", customer: "Akua", place: "Spintex, Accra", branch: "Accra", items: "Slides · EU 42", channel: "Walk-in", pay: "half", payNote: "Half paid · cash", total: 180, balance: 90, agent: "Akosua", status: "packed", age: "20 min", log: [], notes: [] },
  { id: "DRZ-1031", customer: "Abena", place: "Ahodwo, Kumasi", branch: "Kumasi", items: 'Air Jordan 4 "Red Patent" · EU 41', channel: "Web", pay: "paid", payNote: "Paid in full · MoMo", total: 430, balance: 0, agent: "Akosua", status: "to_confirm", age: "26 h since payment", log: [{ at: "Yesterday 9:30", text: "Payment confirmed" }], notes: [] },
  { id: "DRZ-1030", customer: "Selorm", place: "Tamale", branch: "Kumasi", items: "Denim set · M, and 1 more item", channel: "Web", pay: "paid", payNote: "Paid in full · MoMo", total: 620, balance: 0, agent: "Kwame", status: "packed", age: "1 h", courier: "Courier", log: [], notes: [] },
  { id: "DRZ-1029", customer: "Efua", place: "Asokwa, Kumasi", branch: "Kumasi", items: "Nike Dunk Low · EU 40", channel: "Instagram DM", pay: "paid", payNote: "Paid in full · MoMo", total: 450, balance: 0, agent: "Kwame", status: "ready_to_pack", age: "40 min", log: [{ at: "8:41", text: "Received at the Kumasi branch, receipt attached" }], notes: [] },
  { id: "DRZ-1028", customer: "Adwoa", place: "Osu, Accra", branch: "Accra", items: "Striped quarter-zip · L", channel: "Web", pay: "half", payNote: "Half paid · MoMo", total: 240, balance: 120, agent: "Akosua", status: "out", age: "On the way", log: [], notes: [] },
  { id: "DRZ-1027", customer: "Ama", place: "Adum, Kumasi", branch: "Kumasi", items: 'Air Jordan 1 "Triple Black" · EU 42', channel: "Web", pay: "paid", payNote: "Paid in full · MoMo", total: 430, balance: 0, agent: "Kwame", status: "out", age: "On the way", log: [{ at: "11:05", text: "Dispatched, rider Yaw" }], notes: [] },
  { id: "DRZ-1026", customer: "Kwabena", place: "Sunyani", branch: "Kumasi", items: 'Air Jordan 1 "Triple Black" · EU 44', channel: "WhatsApp", pay: "paid", payNote: "Paid in full · Skynet", total: 460, balance: 0, agent: "Kwame", status: "dispatched", age: "2 h", courier: "Skynet", log: [], notes: [] },
];

const dash = createStore<{ orders: DashOrder[] }>({ orders: seed }, "drezzy.dash.v1");

export const useDashOrders = () => useStore(dash).orders;
export const useDashOrder = (id: string) => useStore(dash).orders.find((o) => o.id === id);

const stamp = () => new Date().toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" });

function patch(id: string, fn: (o: DashOrder) => DashOrder) {
  dash.set((s) => ({ orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) }));
}

export type MoveResult = { ok: true } | { ok: false; reason: string };

/** Rules from the PRD: steps only move forward, and an order with a balance cannot be Delivered until it is collected. */
export function canMove(o: DashOrder, to: Status): MoveResult {
  if (o.status === to) return { ok: true };
  if (o.pay === "pending" && to !== "awaiting_payment") return { ok: false, reason: "Check the manual MoMo payment first." };
  if (to === "failed") return o.status === "out" || o.status === "dispatched" ? { ok: true } : { ok: false, reason: "Only a dispatched order can fail delivery." };
  if (order(to) < order(o.status)) return { ok: false, reason: "Only an Admin can move an order back, with a reason." };
  if (to === "delivered" && o.balance > 0) return { ok: false, reason: `Record the balance collected (GHS ${o.balance}) before marking it delivered.` };
  return { ok: true };
}

export function moveOrder(id: string, to: Status, who = "You (Owner)"): MoveResult {
  const o = dash.get().orders.find((x) => x.id === id);
  if (!o) return { ok: false, reason: "Order not found." };
  const check = canMove(o, to);
  if (!check.ok || o.status === to) return check;
  patch(id, (x) => ({ ...x, status: to, age: "Just now", log: [{ at: stamp(), text: `${stageTitle(to)} · ${who}` }, ...x.log] }));
  return { ok: true };
}

export function confirmPayment(id: string) {
  patch(id, (o) => ({ ...o, pay: "paid", payNote: "Paid in full · MoMo (checked)", status: o.status === "awaiting_payment" ? "to_confirm" : o.status, log: [{ at: stamp(), text: "Manual MoMo payment checked · You (Owner)" }, ...o.log] }));
}

export function recordBalance(id: string) {
  patch(id, (o) => ({ ...o, balance: 0, pay: "paid", payNote: "Paid in full · balance collected", log: [{ at: stamp(), text: `Balance GHS ${o.balance} collected · You (Owner)` }, ...o.log] }));
}

export function moveBack(id: string, to: Status, reason: string) {
  patch(id, (o) => ({ ...o, status: to, age: "Just now", log: [{ at: stamp(), text: `Moved back to ${stageTitle(to)} · Admin override: ${reason}` }, ...o.log] }));
}

export const addNote = (id: string, text: string) => patch(id, (o) => ({ ...o, notes: [text, ...o.notes] }));
export const resetDemo = () => dash.set({ orders: seed });

export type NewOrderInput = Pick<DashOrder, "customer" | "place" | "branch" | "items" | "channel" | "total" | "balance" | "pay" | "payNote">;

/** Staff-created order (WhatsApp, phone, walk-in). Starts at "Awaiting payment or check" until the payment is confirmed. */
export function createDashOrder(input: NewOrderInput): DashOrder {
  const max = Math.max(...dash.get().orders.map((o) => Number(o.id.replace("DRZ-", ""))));
  const o: DashOrder = {
    ...input,
    id: `DRZ-${max + 1}`,
    agent: "You",
    status: input.pay === "paid" ? "to_confirm" : "awaiting_payment",
    age: "Just now",
    log: [{ at: stamp(), text: `Order created from ${input.channel} · You (Owner)` }],
    notes: [],
  };
  dash.set((s) => ({ orders: [o, ...s.orders] }));
  return o;
}
