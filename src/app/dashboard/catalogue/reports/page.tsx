import { Suspense } from "react";
import { PageHead, Table } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Catalogue reports" };

type Report = {
  by_availability: Record<string, number> | null; not_checked: number; avg_lead_days: number | null; could_not_source: number;
  margins: { sku: string; product: string; price: number; best_cost: number; margin: number }[] | null;
  suppliers: { supplier: string; orders: number; received: number; failed: number; on_time_rate: number | null; avg_days: number | null; avg_cost_change: number | null }[];
};

const word: Record<string, string> = { available: "Available", limited: "Limited", unavailable: "Unavailable", pre_order: "Pre-order" };

/** Catalogue reports and supplier performance (FR-CAT-010, 011). The database leaves out margins for roles without cost access. */
async function Reports() {
  await requireStaff();
  const supabase = await createClient();
  const { data: alerts } = await supabase.from("app_settings").select("value").eq("key", "alerts").maybeSingle();
  const stale = Number((alerts?.value as { stale_days?: number } | null)?.stale_days ?? 7);
  const { data, error } = await supabase.rpc("catalogue_report", { p_stale_days: stale });
  if (error || !data) return <p className="card p-6 text-sm text-text2">You cannot see this report.</p>;
  const r = data as Report;
  const tiles: [string, string | number][] = [
    ...Object.entries(r.by_availability ?? {}).map(([k, n]): [string, number] => [word[k] ?? k, n]),
    [`Not checked in ${stale} days`, r.not_checked], ["Average lead time", r.avg_lead_days === null ? "-" : `${r.avg_lead_days} days`], ["Could not be sourced", r.could_not_source],
  ];
  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([l, n]) => <li key={l} className="card p-4"><p className="text-sm text-text2">{l}</p><p className="text-2xl font-bold">{n}</p></li>)}
      </ul>
      <section>
        <h2 className="mb-2 font-semibold">Supplier performance</h2>
        {r.suppliers.length === 0 ? <p className="card p-6 text-center text-sm text-text2">No supplier orders yet.</p> : (
          <Table head={["Supplier", "Orders", "Received", "Failed", "On time", "Average days", "Average cost change"]} rows={r.suppliers.map((s) => [
            s.supplier, s.orders, s.received, s.failed, s.on_time_rate === null ? "-" : `${s.on_time_rate}%`, s.avg_days ?? "-", s.avg_cost_change === null ? "-" : `GHS ${s.avg_cost_change}`,
          ])} />
        )}
      </section>
      {r.margins && (
        <section>
          <h2 className="mb-2 font-semibold">Margin per item</h2>
          <p className="mb-2 text-sm text-text2">Price minus the best supplier cost, lowest margin first.</p>
          {r.margins.length === 0 ? <p className="card p-6 text-center text-sm text-text2">No supplier costs recorded yet.</p> : (
            <Table head={["Product", "SKU", "Price", "Best cost", "Margin"]} rows={r.margins.slice(0, 200).map((m) => [m.product, m.sku, `GHS ${m.price}`, `GHS ${m.best_cost}`, `${m.margin}%`])} />
          )}
        </section>
      )}
    </div>
  );
}

export default function CatalogueReports() {
  return (
    <Guard module="availability">
      <PageHead real title="Catalogue reports" sub="How honest the catalogue is, and how suppliers are doing" />
      <DbGate>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Reports />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
