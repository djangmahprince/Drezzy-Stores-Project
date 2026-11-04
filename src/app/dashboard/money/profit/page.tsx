import { Suspense } from "react";
import { PageHead, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { lastDays } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profit" };
const ghs = (n: number) => `GHS ${Number(n).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

/** Profit by month and branch (FR-FIN-008): net sales minus supplier costs, expenses and salaries. */
async function Live() {
  const { from, to } = await lastDays(365);
  const { data, error } = await (await createClient()).rpc("profit_report", { p_from: from, p_to: to });
  if (error) return <p className="card p-8 text-center text-text2">The profit report is for the Owner and Finance.</p>;
  const rows = ((data ?? []) as { month: string; branch: string; net_sales: number; supplier_costs: number; expenses: number; salaries: number; profit: number }[])
    .filter((r) => r.net_sales || r.supplier_costs || r.expenses || r.salaries).reverse();
  if (!rows.length) return <p className="card p-8 text-center text-text2">Nothing recorded in the last 12 months.</p>;
  return <Table head={["Month", "Branch", "Net sales", "Supplier costs", "Expenses", "Salaries", "Profit"]} rows={rows.map((r) => [
    new Date(r.month).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), r.branch === "both" ? "Shared" : r.branch === "accra" ? "Accra" : "Kumasi", ghs(r.net_sales), ghs(r.supplier_costs), ghs(r.expenses), ghs(r.salaries),
    <b key="p" className={Number(r.profit) < 0 ? "text-error" : "text-success"}>{ghs(r.profit)}</b>,
  ])} />;
}

export default function Page() {
  return (
    <Guard module="salary">
      <PageHead real title="Profit" sub="By month and branch, last 12 months. Shared costs and salaries sit on their own line." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Live /></Suspense>
    </Guard>
  );
}
