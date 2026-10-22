"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markSalaryPaidAction, saveSalaryAction, type SalaryResult } from "@/app/dashboard/money/salaries/actions";
import { Kpi, Pill } from "@/components/dashboard/DashShell";
import { formatGHS } from "@/lib/data";
import type { SalaryData } from "@/lib/money/salaries";

export function SalaryLive({ d }: { d: SalaryData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(Object.fromEntries(d.rows.map((r) => [r.staffId, r.amount?.toString() ?? ""])));

  function run(fn: () => Promise<SalaryResult>, ok: string) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { text: ok, bad: false } : { text: res.error, bad: true });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/dashboard/money/salaries?month=${d.prev}`} className="btn-outline !min-h-9 text-sm">← Earlier</Link>
        <h2 className="font-semibold">{d.label}</h2>
        <Link href={`/dashboard/money/salaries?month=${d.next}`} className="btn-outline !min-h-9 text-sm">Later →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Paid this month" value={formatGHS(d.paid)} />
        <Kpi label="Still due" value={formatGHS(d.due)} />
      </div>
      {msg && <p role="status" className={`rounded-[12px] p-3 text-sm ${msg.bad ? "bg-[#fdecec] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <section className="card divide-y divide-line">
        {d.rows.map((r) => (
          <div key={r.staffId} className="grid items-center gap-2 p-4 text-sm md:grid-cols-[1.4fr_1fr_1.4fr]">
            <span><b>{r.name}</b><br /><span className="text-xs text-text2">{r.role}</span></span>
            {r.status === "paid" ? (
              <span>{formatGHS(r.amount ?? 0)}</span>
            ) : (
              <input aria-label={`Salary for ${r.name}`} type="number" min={0} step="0.01" disabled={!d.canEdit} className="field !min-h-10" placeholder="GHS" value={amounts[r.staffId] ?? ""} onChange={(e) => setAmounts({ ...amounts, [r.staffId]: e.target.value })} />
            )}
            <span className="flex flex-wrap items-center gap-2">
              {r.status === "paid" && <Pill tone="ok">Paid {r.paidOn} · {r.method}</Pill>}
              {r.status === "due" && <Pill tone="warn">Due</Pill>}
              {r.status === null && <Pill tone="info">Not set</Pill>}
              {d.canEdit && r.status !== "paid" && (
                <button type="button" disabled={pending || !amounts[r.staffId] || Number(amounts[r.staffId]) === r.amount} className="btn-outline !min-h-9 text-xs disabled:opacity-40" onClick={() => run(() => saveSalaryAction({ staffId: r.staffId, month: d.month, amount: Number(amounts[r.staffId]) }), `Saved for ${r.name}.`)}>Save</button>
              )}
              {d.canEdit && r.status === "due" && r.recordId && (
                <button type="button" disabled={pending} className="btn-primary !min-h-9 text-xs" onClick={() => {
                  const how = window.prompt(`How was ${r.name} paid? Type cash, momo or bank`, "momo")?.trim().toLowerCase();
                  if (how === "cash" || how === "momo" || how === "bank") run(() => markSalaryPaidAction(r.recordId!, how), `Marked as paid for ${r.name}.`);
                  else if (how) setMsg({ text: "Type cash, momo or bank.", bad: true });
                }}>Mark paid</button>
              )}
            </span>
          </div>
        ))}
      </section>
      <p className="text-xs text-text2">Only the Owner and Finance can see this page. A paid salary cannot be changed afterwards. Paid salaries count as money out on the Money page.</p>
    </div>
  );
}
