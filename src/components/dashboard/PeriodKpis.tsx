"use client";

import { useState } from "react";
import { Kpi } from "@/components/dashboard/DashShell";

const periods = {
  Today: [
    ["Net sales", "GHS 3,120", "▲ 6% vs yesterday"],
    ["Paid orders", "7", "▲ 1 vs yesterday"],
    ["Balances to collect", "GHS 340", "2 half-paid Accra orders"],
    ["Waiting on suppliers", "4 orders", "1 supplier late"],
    ["On-time delivery", "100%", "3 of 3 today"],
  ],
  "This week": [
    ["Net sales", "GHS 18,450", "▲ 12% vs last week"],
    ["Paid orders", "46", "▲ 8% vs last week"],
    ["Balances to collect", "GHS 1,200", "6 half-paid Accra orders"],
    ["Waiting on suppliers", "4 orders", "1 supplier late"],
    ["On-time delivery", "91%", "▲ 4 pts · 42 of 46"],
  ],
  "This month": [
    ["Net sales", "GHS 71,900", "▲ 9% vs last month"],
    ["Paid orders", "188", "▲ 14% vs last month"],
    ["Balances to collect", "GHS 1,200", "6 half-paid Accra orders"],
    ["Waiting on suppliers", "4 orders", "1 supplier late"],
    ["On-time delivery", "93%", "▲ 2 pts · 175 of 188"],
  ],
} as const;

export function PeriodKpis() {
  const [p, setP] = useState<keyof typeof periods>("This week");
  return (
    <>
      <div className="mb-4 flex gap-1 text-sm" role="group" aria-label="Period">
        {(Object.keys(periods) as (keyof typeof periods)[]).map((t) => (
          <button key={t} type="button" aria-pressed={p === t} onClick={() => setP(t)} className={`chip min-h-9 px-3 transition-colors ${p === t ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-live="polite">
        {periods[p].map(([label, value, note]) => <Kpi key={label} label={label} value={value} note={note} />)}
      </div>
    </>
  );
}
