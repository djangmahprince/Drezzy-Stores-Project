import type { OwnerView } from "@/lib/dashboard/owner-types";

const line = (ys: number[]) => ys.map((y, i) => ({ x: `Day ${i + 1}`, y }));
const suppliers = { label: "Waiting on suppliers", value: "4 orders", note: "1 supplier late", noteTone: "bad" as const, trend: line([5, 6, 5, 4, 5, 4, 4]) };

/** Design preview only. Connect Supabase and the real numbers replace all of this. */
export const ownerSample: OwnerView = {
  greeting: "Good morning",
  periods: {
    today: [
      { label: "Net sales", value: "GHS 3,120", note: "▲ 6% vs yesterday", noteTone: "ok", trend: line([2, 3, 2, 4, 3, 5, 6]) }, { label: "Paid orders", value: "7", note: "▲ 1 vs yesterday", noteTone: "ok", trend: line([3, 4, 3, 5, 4, 6, 7]) },
      { label: "Balances to collect", value: "GHS 340", note: "2 half-paid Accra orders", trend: line([4, 4, 3, 4, 3, 3, 3]) }, suppliers, { label: "On-time delivery", value: "100%", note: "3 of 3 today", noteTone: "ok", trend: line([90, 92, 95, 94, 96, 98, 100]) },
    ],
    week: [
      { label: "Net sales", value: "GHS 18,450", note: "▲ 12% vs last week", noteTone: "ok", trend: line([4, 4.5, 4.2, 5, 4.8, 5.4, 5.8]) }, { label: "Paid orders", value: "46", note: "▲ 8% vs last week", noteTone: "ok", trend: line([38, 37, 40, 41, 40, 43, 46]) },
      { label: "Balances to collect", value: "GHS 1,200", note: "6 half-paid Accra orders", trend: line([9, 10, 10, 11, 10, 11, 11]) }, suppliers, { label: "On-time delivery", value: "91%", note: "▲ 4 pts · 42 of 46", noteTone: "ok", trend: line([85, 86, 87, 89, 89, 90, 91]) },
    ],
    month: [
      { label: "Net sales", value: "GHS 71,900", note: "▲ 9% vs last month", noteTone: "ok", trend: line([50, 54, 58, 60, 64, 68, 72]) }, { label: "Paid orders", value: "188", note: "▲ 14% vs last month", noteTone: "ok", trend: line([120, 130, 140, 150, 165, 176, 188]) },
      { label: "Balances to collect", value: "GHS 1,200", note: "6 half-paid Accra orders", trend: line([9, 10, 10, 11, 10, 11, 11]) }, suppliers, { label: "On-time delivery", value: "93%", note: "▲ 2 pts · 175 of 188", noteTone: "ok", trend: line([88, 89, 90, 91, 92, 92, 93]) },
    ],
  },
  week: {
    goal: 25000, paid: 18450, daysLeft: 2, paceNeeded: 3570,
    days: [["Mon", 2600], ["Tue", 3100], ["Wed", 2850], ["Thu", 4000], ["Fri", 2300], ["Sat", 0], ["Sun", 0]].map(([label, amount], i) => ({ label: String(label), amount: Number(amount), today: i === 4, future: i > 4 })),
  },
  stages: [
    { label: "Awaiting payment or check", count: 3 }, { label: "To confirm", note: "2 waiting over 2 hours", count: 5, tone: "warn" }, { label: "Getting from supplier", count: 4 }, { label: "Packed", count: 4 },
    { label: "Dispatched", count: 6 }, { label: "Out for delivery", count: 3 }, { label: "Delivered this week", count: 25 }, { label: "Failed delivery", count: 1, tone: "bad" },
  ],
  sources: [{ source: "Instagram", count: 16 }, { source: "TikTok", count: 10 }, { source: "WhatsApp", count: 8 }, { source: "Friend or relative", count: 6 }, { source: "Snapchat", count: 4 }, { source: "Walk-in", count: 2 }],
  team: [
    { name: "Kwame", role: "Sales, Kumasi", text: "GHS 6,240 of 8,000 paid sales", pct: 78, pace: "On pace", tone: "ok" }, { name: "Akosua", role: "Sales, Accra", text: "GHS 3,920 of 8,000 paid sales", pct: 49, pace: "Behind", tone: "warn" },
    { name: "Yaw", role: "Dispatch, Kumasi", text: "On-time delivery 93%, target 95%", pct: 93, pace: "On pace", tone: "ok" }, { name: "Esi", role: "Content", text: "3 of 3 Drip School posts published", pct: 100, pace: "Hit", tone: "ok" },
  ],
  attention: [
    { tag: "Supplier late", text: "adidas Samba · EU 41 · was due yesterday", href: "/dashboard/orders", tone: "bad" }, { tag: "Check", text: "Manual MoMo payment for DRZ-1035 waiting", href: "/dashboard/orders", tone: "warn" },
    { tag: "Stuck", text: "DRZ-1031 not confirmed for 3 h · Akosua", href: "/dashboard/orders", tone: "warn" }, { tag: "Suppliers", text: "12 items not confirmed with suppliers for 7 days", href: "/dashboard/catalogue", tone: "info" },
  ],
};
