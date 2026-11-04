"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeMonthAction, handoverAction, unlockMonthAction } from "@/app/dashboard/money/actions";
import { Pill, Table } from "@/components/dashboard/DashShell";

const ghs = (n: number) => `GHS ${Number(n).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

export function RiderCash({ day, rows }: { day: string; rows: { rider_id: string; name: string; phone: string | null; collected: number; handed_in: number | null; checked_by: string | null; note: string | null }[] }) {
  const router = useRouter();
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">Day <input type="date" className="field !min-h-10 max-w-44" value={day} onChange={(e) => router.push(`/dashboard/money/riders?day=${e.target.value}`)} /></label>
      {msg && <p role="status" className="text-sm text-text2">{msg}</p>}
      {rows.length === 0 ? <p className="card p-6 text-sm text-text2">No riders yet. Add them in Settings → Riders.</p> : (
        <Table head={["Rider", "Collected", "Handed in", "Difference", ""]} rows={rows.map((r) => {
          const diff = r.handed_in === null ? null : Number(r.collected) - Number(r.handed_in);
          return [
            r.name, ghs(r.collected), r.handed_in === null ? "Not recorded" : `${ghs(r.handed_in)}${r.checked_by ? ` · ${r.checked_by}` : ""}`,
            diff === null ? (Number(r.collected) > 0 ? <Pill key="d" tone="warn">Waiting</Pill> : "") : diff === 0 ? <Pill key="d" tone="ok">Matches</Pill> : <Pill key="d" tone="bad">{diff > 0 ? `Short ${ghs(diff)}` : `Over ${ghs(-diff)}`}</Pill>,
            <span key="f" className="flex gap-1">
              <input type="number" step="0.01" min={0} className="field !min-h-9 w-28" aria-label={`Cash handed in by ${r.name}`} value={amt[r.rider_id] ?? ""} onChange={(e) => setAmt({ ...amt, [r.rider_id]: e.target.value })} />
              <button type="button" disabled={pending || !amt[r.rider_id]} className="btn-primary !min-h-9 !px-3 text-sm" onClick={() => start(async () => { const x = await handoverAction(r.rider_id, day, Number(amt[r.rider_id]), ""); setMsg(x.ok ? "Recorded." : x.error); router.refresh(); })}>Save</button>
            </span>,
          ];
        })} />
      )}
    </div>
  );
}

export function MonthClose({ closes, log, canClose, isOwner }: { closes: { month: string; closed_by_name: string | null; closed_at: string; note: string | null }[]; log: { month: string; action: string; by_name: string | null; reason: string | null; at: string }[]; canClose: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [month, setMonth] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const label = (m: string) => new Date(m).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Month close</h2>
      <p className="text-sm text-text2">Closing a month locks its expenses, money in, salaries and rider cash. Only the Owner can unlock it, and that is logged (FR-FIN-009).</p>
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      {canClose && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="field !min-h-10 max-w-44" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month to close" />
          <button type="button" disabled={pending || !month} className="btn-primary !min-h-10" onClick={() => { if (window.confirm(`Close ${month}? Its figures will be locked.`)) start(async () => { const r = await closeMonthAction(month, ""); setMsg(r.ok ? { text: "Month closed." } : { text: r.error, bad: true }); router.refresh(); }); }}>Close this month</button>
        </div>
      )}
      {closes.length > 0 && <Table head={["Month", "Closed by", "When", ""]} rows={closes.map((c) => [label(c.month), c.closed_by_name ?? "", new Date(c.closed_at).toLocaleDateString("en-GB"),
        isOwner ? <button key="u" type="button" className="text-navy underline" onClick={() => { const reason = window.prompt("Why unlock this month? (kept in the log)") ?? ""; if (reason.trim().length >= 3) start(async () => { const r = await unlockMonthAction(c.month.slice(0, 7), reason); setMsg(r.ok ? { text: "Unlocked." } : { text: r.error, bad: true }); router.refresh(); }); }}>Unlock</button> : ""])} />}
      {log.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-text2">Close and unlock log</summary><ul className="mt-2 space-y-1">{log.map((l, i) => <li key={i}>{new Date(l.at).toLocaleDateString("en-GB")} · {label(l.month)} {l.action} by {l.by_name ?? "someone"}{l.reason ? `: ${l.reason}` : ""}</li>)}</ul></details>}
    </section>
  );
}
