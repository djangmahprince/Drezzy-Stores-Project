import { Suspense } from "react";
import { CrudEditor } from "@/components/dashboard/CrudEditor";
import { PageHead, Progress, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { MonthClose } from "@/components/dashboard/MoneyTools";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { today } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Budgets and month close" };

async function Live({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ month }, t, me] = await Promise.all([searchParams, today(), requireStaff()]);
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : t.month;
  const supabase = await createClient();
  const [status, closes, log] = await Promise.all([
    supabase.rpc("budget_status", { p_month: `${m}-01` }),
    supabase.from("month_closes").select("month, closed_by_name, closed_at, note").order("month", { ascending: false }).limit(24),
    supabase.from("month_close_log").select("month, action, by_name, reason, at").order("at", { ascending: false }).limit(20),
  ]);
  const rows = (status.data ?? []) as { label: string; budget: number; spent: number; pct: number | null }[];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Budget use for {m}</h2>
        {rows.length === 0 ? <p className="card p-6 text-sm text-text2">No budgets set. Add one below. You get an alert at 80%.</p> : (
          <Table head={["Category", "Budget", "Spent", ""]} rows={rows.map((r) => [r.label, `GHS ${Number(r.budget).toLocaleString("en-GH")}`, `GHS ${Number(r.spent).toLocaleString("en-GH")} (${r.pct ?? 0}%)`, <Progress key={r.label} pct={r.pct ?? 0} tone={(r.pct ?? 0) >= 100 ? "bad" : (r.pct ?? 0) >= 80 ? "warn" : "ok"} />])} />
        )}
      </section>
      <CrudEditor name="budgets" canEdit={can(me.permissions, "expenses", "delete")} intro="A budget per expense category, for every month or one month (FR-FIN-010)." />
      <MonthClose closes={(closes.data ?? []) as Parameters<typeof MonthClose>[0]["closes"]} log={(log.data ?? []) as Parameters<typeof MonthClose>[0]["log"]} canClose={can(me.permissions, "expenses", "delete")} isOwner={me.roleKey === "owner"} />
    </div>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  return (
    <Guard module="expenses">
      <PageHead real title="Budgets and month close" sub="Spending limits, and locking a month after review" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Live searchParams={searchParams} /></Suspense>
    </Guard>
  );
}
