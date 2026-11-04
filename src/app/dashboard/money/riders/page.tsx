import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { RiderCash } from "@/components/dashboard/MoneyTools";
import { today } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Rider cash" };

/** Rider cash reconciliation (FR-FIN-006): cash collected per rider per day against cash handed in. */
async function Live({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const [{ day }, t] = await Promise.all([searchParams, today()]);
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : t.date;
  const { data, error } = await (await createClient()).rpc("rider_cash", { p_day: d });
  if (error) return <p className="card p-8 text-center text-text2">Your role cannot see rider cash.</p>;
  return <RiderCash day={d} rows={(data ?? []) as Parameters<typeof RiderCash>[0]["rows"]} />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  return (
    <Guard module="expenses">
      <PageHead real title="Rider cash" sub="Cash each rider collected against cash handed in. Differences are flagged." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Live searchParams={searchParams} /></Suspense>
    </Guard>
  );
}
