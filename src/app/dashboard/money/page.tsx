import { Suspense } from "react";
import { Guard } from "@/components/dashboard/Guard";
import { MoneyLive } from "@/components/dashboard/MoneyLive";
import { getMoney, type MoneyData } from "@/lib/money/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Money" };

const row = (at: string, direction: "in" | "out", label: string, category: string, branch: string, method: string, amount: number) => ({ at, direction, label, category, branch, method, amount, source: "sample" });

/** Design preview only: the same screen as the live one, with invented figures. */
const sample: MoneyData = {
  month: "2026-11", label: "November 2026", prev: "2026-10", next: "2026-12", canAdd: true, canSeeSalaries: true, canManage: true, closed: false, categories: [{ value: "other", label: "Other" }],
  summary: { moneyIn: 24600, moneyOut: 18170, net: 6430, owed: 1200, byCategory: [{ category: "Supplier costs", amount: 13900 }, { category: "Salaries", amount: 2400 }, { category: "Delivery and riders", amount: 820 }, { category: "Ads and promotion", amount: 600 }, { category: "Refunds", amount: 450 }] },
  ledger: [
    row("2026-11-06T09:14:00Z", "in", "Half payment · DRZ-1036", "Sales", "accra", "MTN MoMo", 200), row("2026-11-06T08:41:00Z", "out", "Supplier order · DRZ-1029 · receipt", "Supplier cost", "kumasi", "MoMo", 260),
    row("2026-11-06T08:40:00Z", "in", "Balance collected · DRZ-1022", "Sales", "accra", "Cash · Kofi", 200), row("2026-11-05T17:10:00Z", "out", "Rider fuel and fares · receipt", "Delivery and riders", "accra", "Cash", 120),
    row("2026-11-05T11:02:00Z", "in", "Payment · DRZ-1033", "Sales", "kumasi", "Card", 450), row("2026-11-02T10:00:00Z", "out", "Instagram ads, weekend promo", "Ads and promotion", "both", "Card", 300),
    row("2026-11-02T09:30:00Z", "out", "Refund · DRZ-1012 · could not source", "Refund", "kumasi", "MTN MoMo", 450),
  ],
  riderCash: [{ name: "Kofi", collected: 400, handedIn: 400 }, { name: "Yaw", collected: 200, handedIn: null }],
  salaries: { staff: 5, total: 2400, paid: 3, due: 2 },
  paystackUsed: 18450,
};

async function Live({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const now = new Date();
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return <MoneyLive d={await getMoney(valid)} />;
}

export default function Money({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  return (
    <Guard module={["expenses", "salary"]}>
      {isSupabaseConfigured ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Live searchParams={searchParams} />
        </Suspense>
      ) : (
        <MoneyLive d={sample} real={false} />
      )}
    </Guard>
  );
}
