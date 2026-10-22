"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addExpenseAction, type ExpenseState } from "@/app/dashboard/money/actions";
import { Kpi, Pill, Progress, Table } from "@/components/dashboard/DashShell";
import { formatGHS } from "@/lib/data";
import type { MoneyData } from "@/lib/money/staff";

const stamp = (iso: string) => new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(iso));

function ExpenseForm({ d }: { d: MoneyData }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addExpenseAction, {});
  const [open, setOpen] = useState(false);
  if (!d.canAdd) return null;
  return (
    <div className="mb-4">
      <button type="button" className="btn-primary !min-h-10" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add expense"}</button>
      {open && (
        <form action={action} className="card mt-3 grid gap-3 p-4 sm:grid-cols-3" noValidate>
          <label className="text-sm"><span className="mb-1 block font-medium">Category</span>
            <select name="category" className="field" defaultValue="">
              <option value="" disabled>Choose</option>{d.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Amount (GHS)</span><input name="amount" type="number" min={0} step="0.01" className="field" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Date</span><input name="date" type="date" className="field" defaultValue={`${d.month}-01`} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Paid by</span>
            <select name="method" className="field" defaultValue="cash"><option value="cash">Cash</option><option value="momo">MoMo</option><option value="card">Card</option><option value="bank">Bank</option></select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Branch</span>
            <select name="branch" className="field" defaultValue="both"><option value="both">Both</option><option value="accra">Accra</option><option value="kumasi">Kumasi</option></select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Note</span><input name="note" className="field" placeholder="What was it for?" /></label>
          {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error sm:col-span-3">{state.error}</p>}
          {state.ok && <p role="status" className="rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success sm:col-span-3">Expense recorded. Refresh the page to see it in the list.</p>}
          <div className="sm:col-span-3"><button disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60">{pending ? "Saving…" : "Save expense"}</button></div>
        </form>
      )}
    </div>
  );
}

export function MoneyLive({ d }: { d: MoneyData }) {
  const s = d.summary;
  const top = Math.max(1, ...(s?.byCategory.map((c) => c.amount) ?? [1]));
  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-sm" aria-label="Month">
        <Link href={`/dashboard/money?month=${d.prev}`} className="btn-outline !min-h-10" aria-label="Previous month">‹</Link>
        <span className="min-w-36 text-center font-semibold">{d.label}</span>
        <Link href={`/dashboard/money?month=${d.next}`} className="btn-outline !min-h-10" aria-label="Next month">›</Link>
        {d.canSeeSalaries && <Link href={`/dashboard/money/salaries?month=${d.month}`} className="btn-outline !min-h-10 ml-auto">Salaries</Link>}
      </div>

      {s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Money in" value={formatGHS(s.moneyIn)} note="Payments and balances collected" />
          <Kpi label="Money out" value={formatGHS(s.moneyOut)} note="Supplier costs and expenses" />
          <Kpi label="Net cash flow" value={formatGHS(s.net)} note={s.net < 0 ? "Spending is ahead of sales this month" : "Both branches"} />
          <Kpi label="Balances to collect" value={formatGHS(s.owed)} note="Half-paid orders still owing" />
        </div>
      ) : (
        <p className="mb-3 rounded-[12px] bg-card p-3 text-sm text-text2">Your role shows the records you are allowed to record. Company-wide totals are for Finance, Admin and the Owner.</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <ExpenseForm d={d} />
          <h2 className="mb-2 font-semibold">Money in and out</h2>
          {d.ledger.length === 0 ? <p className="card p-8 text-center text-sm text-text2">Nothing recorded this month.</p> : (
            <Table head={["When", "What", "Category", "Branch", "Method", "Amount (GHS)"]} rows={d.ledger.map((r) => [
              stamp(r.at), r.label, r.category, r.branch === "kumasi" ? "Kumasi" : r.branch === "accra" ? "Accra" : "Both", r.method,
              <Pill key={r.source + r.at + r.amount} tone={r.direction === "in" ? "ok" : "warn"}>{r.direction === "in" ? "+" : "−"}{r.amount.toLocaleString("en-GH")}</Pill>,
            ])} />
          )}
        </section>
        {s && (
          <section className="card h-fit p-4">
            <h2 className="font-semibold">Money out by category</h2>
            {s.byCategory.length === 0 ? <p className="mt-2 text-sm text-text2">No spending yet.</p> : (
              <ul className="mt-3 space-y-3 text-sm">
                {s.byCategory.map((c) => <li key={c.category}><p className="flex justify-between"><span>{c.category}</span><b>{formatGHS(c.amount)}</b></p><Progress pct={(c.amount / top) * 100} /></li>)}
              </ul>
            )}
            <p className="mt-4 rounded-[12px] bg-card p-3 text-xs text-text2">Salary records are for the Owner and Finance only and arrive in a later release. Refunds are recorded with the refund workflow.</p>
          </section>
        )}
      </div>
    </>
  );
}
