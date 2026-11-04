"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { addExpenseAction, addMoneyInAction, type ExpenseState } from "@/app/dashboard/money/actions";
import { Kpi, PageHead, Pill, Progress } from "@/components/dashboard/DashShell";
import { Icon } from "@/components/Icon";
import { formatGHS } from "@/lib/data";
import type { MoneyData } from "@/lib/money/staff";

const PAYSTACK_LIMIT = 30000; // Paystack pauses Starter accounts at this total (PRD section 22)

const stamp = (iso: string) => new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(iso));

function ExpenseForm({ d }: { d: MoneyData }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addExpenseAction, {});
  return (
    <div className="mb-4">
      {(
        <form action={action} className="card grid gap-3 p-4 sm:grid-cols-3" noValidate>
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
          <label className="text-sm"><span className="mb-1 block font-medium">Receipt photo</span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="field py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Ad campaign (optional)</span><input name="campaign" className="field" placeholder="detty-december" /></label>
          {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error sm:col-span-3">{state.error}</p>}
          {state.ok && <p role="status" className="rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success sm:col-span-3">Expense recorded. Refresh the page to see it in the list.</p>}
          <div className="sm:col-span-3"><button disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60">{pending ? "Saving…" : "Save expense"}</button></div>
        </form>
      )}
    </div>
  );
}

function MoneyInForm({ d }: { d: MoneyData }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addMoneyInAction, {});
  return (
    <div className="mb-4">
      {(
        <form action={action} className="card grid gap-3 p-4 sm:grid-cols-3" noValidate>
          <label className="text-sm"><span className="mb-1 block font-medium">Amount (GHS)</span><input name="amount" type="number" min={0} step="0.01" className="field" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Date</span><input name="date" type="date" className="field" defaultValue={`${d.month}-01`} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">What is it?</span><input name="reason" className="field" placeholder="Owner top-up" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">How</span><select name="method" className="field" defaultValue="momo"><option value="momo">MoMo</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Branch</span><select name="branch" className="field" defaultValue="both"><option value="both">Both</option><option value="accra">Accra</option><option value="kumasi">Kumasi</option></select></label>
          {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error sm:col-span-3">{state.error}</p>}
          {state.ok && <p role="status" className="rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success sm:col-span-3">Recorded. Refresh to see it.</p>}
          <div className="sm:col-span-3"><button disabled={pending} className="btn-primary !min-h-10">{pending ? "Saving…" : "Save"}</button></div>
        </form>
      )}
    </div>
  );
}

function months(current: string) {
  const [y, m] = current.split("-").map(Number);
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + 6 - i, 1));
    return { value: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "UTC" }).format(d) };
  });
}

export function MoneyLive({ d, real = true }: { d: MoneyData; real?: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"" | "expense" | "in">("");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const ledger = d.ledger.filter((r) => !term || JSON.stringify(r).toLowerCase().includes(term));
  const s = d.summary;
  const top = Math.max(1, ...(s?.byCategory.map((c) => c.amount) ?? [1]));
  const used = d.paystackUsed === null ? null : Math.round((d.paystackUsed / PAYSTACK_LIMIT) * 100);
  const toggle = (p: "expense" | "in") => setPanel((x) => (x === p ? "" : p));
  return (
    <>
      <PageHead real={real} title="Money" sub="Every cedi in and out. Payments, supplier costs and refunds are recorded automatically; expenses are added here." />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-text2">Month
          <select className="min-h-11 rounded-[12px] border border-line bg-white px-3 font-medium text-ink" value={d.month} onChange={(e) => router.push(`/dashboard/money?month=${e.target.value}`)}>
            {months(d.month).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {d.closed && <Pill tone="info">Month closed</Pill>}
        <a href={`/api/export?kind=money&format=xlsx&month=${d.month}`} className="btn-outline !min-h-11">Export</a>
        {d.canAdd && <button type="button" className="btn-primary !min-h-11" aria-expanded={panel === "expense"} onClick={() => toggle("expense")}><Icon name="plus" size={18} /> Add expense</button>}
        {d.canManage && d.canAdd && <button type="button" className="btn-outline !min-h-11" aria-expanded={panel === "in"} onClick={() => toggle("in")}>Other money in</button>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-navy lg:ml-auto">
          {d.canManage && <Link href="/dashboard/money/riders" className="underline">Rider cash</Link>}
          {d.canManage && <Link href={`/dashboard/money/budgets?month=${d.month}`} className="underline">Budgets and month close</Link>}
          {d.canSeeSalaries && <Link href="/dashboard/money/profit" className="underline">Profit</Link>}
        </div>
      </div>
      {panel === "expense" && <ExpenseForm d={d} />}
      {panel === "in" && <MoneyInForm d={d} />}

      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Money in" value={formatGHS(s.moneyIn)} note="Payments and balances collected" />
          <Kpi label="Money out" value={formatGHS(s.moneyOut)} note="Suppliers, expenses, refunds" />
          <Kpi label="Net cash flow" value={formatGHS(s.net)} valueTone={s.net < 0 ? "bad" : "ok"} note={s.net < 0 ? "Spending is ahead of sales" : "Both branches"} />
          <Kpi label="Balances to collect" value={formatGHS(s.owed)} note="Half-paid orders still owing" />
          {used !== null && (
            <Kpi label="Paystack Starter limit used" value={formatGHS(d.paystackUsed ?? 0)} note={`${used}% of ${formatGHS(PAYSTACK_LIMIT)} · register to lift it`}>
              <div className="mt-2"><Progress pct={used} tone={used >= 80 ? "bad" : "warn"} /></div>
            </Kpi>
          )}
        </div>
      ) : (
        <p className="mb-3 rounded-[12px] bg-card p-3 text-sm text-text2">Your role shows the records you are allowed to record. Company-wide totals are for Finance, Admin and the Owner.</p>
      )}

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="card min-w-0 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Money in and out</h2>
            {d.ledger.length > 0 ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find in the ledger" className="field !min-h-9 max-w-44 !text-sm" /> : null}
            <span className="text-sm text-text2">Latest first</span>
          </div>
          {d.ledger.length === 0 ? <p className="p-8 text-center text-sm text-text2">Nothing recorded this month.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-text2"><tr>{["When", "What", "Category", "Branch", "Method", "Amount (GHS)"].map((h, i) => <th key={h} className={`py-2 pr-4 font-medium ${i === 5 ? "pr-0 text-right" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {ledger.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-4">{stamp(r.at)}</td><td className="py-2.5 pr-4">{r.label}</td><td className="py-2.5 pr-4">{r.category}</td>
                      <td className="py-2.5 pr-4">{r.branch === "kumasi" ? "Kumasi" : r.branch === "accra" ? "Accra" : "Both"}</td><td className="py-2.5 pr-4">{r.method}</td>
                      <td className={`py-2.5 text-right font-semibold ${r.direction === "in" ? "text-success" : "text-error"}`}>{r.direction === "in" ? "+" : "−"}{r.amount.toLocaleString("en-GH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="space-y-4">
          {s && (
            <section className="card p-4">
              <h2 className="font-semibold">Money out by category</h2>
              {s.byCategory.length === 0 ? <p className="mt-2 text-sm text-text2">No spending yet.</p> : (
                <ul className="mt-3 space-y-2.5 text-sm">
                  {s.byCategory.map((c) => <li key={c.category} className="grid grid-cols-[1.2fr_1fr_auto] items-center gap-3"><span className="truncate">{c.category}</span><Progress pct={(c.amount / top) * 100} /><b>{c.amount.toLocaleString("en-GH")}</b></li>)}
                </ul>
              )}
            </section>
          )}
          {d.riderCash && (
            <section className="card p-4">
              <h2 className="font-semibold">Rider cash today</h2>
              {d.riderCash.length === 0 ? <p className="mt-2 text-sm text-text2">No cash collected today.</p> : (
                <ul className="mt-3 space-y-2 text-sm">
                  {d.riderCash.map((r) => {
                    const short = r.handedIn === null || r.handedIn < r.collected;
                    return <li key={r.name} className={`flex justify-between gap-2 rounded-[10px] px-3 py-2 ${short ? "bg-[#fbeedb] text-warning" : "bg-[#e3f5ee] text-success"}`}><span><b>{r.name}</b> · collected {formatGHS(r.collected)}</span><span>{r.handedIn === null ? "Not handed in" : short ? `Short ${formatGHS(r.collected - r.handedIn)}` : "Handed in"}</span></li>;
                  })}
                </ul>
              )}
            </section>
          )}
          {d.canSeeSalaries && d.salaries && (
            <section className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Salaries this month</h2><span className="chip bg-navy text-lime">Owner and Finance only</span></div>
              <p className="mt-2">{d.salaries.staff} staff · {formatGHS(d.salaries.total)} recorded · {d.salaries.paid} paid, {d.salaries.due} due</p>
              <Link href={`/dashboard/money/salaries?month=${d.month}`} className="mt-2 inline-block font-semibold text-navy underline">Open salary records</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
