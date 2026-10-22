"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHead, Pill } from "@/components/dashboard/DashShell";
import { addNote, confirmPayment, moveBack, moveOrder, recordBalance, stages, stageTitle, useDashOrder, type Status } from "@/lib/dash";
import { trackerSteps } from "@/lib/data";

const next: Partial<Record<Status, { to: Status; label: string }>> = {
  to_confirm: { to: "to_source", label: "Confirm order" },
  to_source: { to: "ready_to_pack", label: "Mark received from supplier" },
  ready_to_pack: { to: "packed", label: "Pack and check" },
  packed: { to: "dispatched", label: "Dispatch" },
  dispatched: { to: "out", label: "Out for delivery" },
  out: { to: "delivered", label: "Mark delivered" },
};

export function OrderDetailView({ id }: { id: string }) {
  const o = useDashOrder(id);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [back, setBack] = useState<{ to: Status; reason: string } | null>(null);

  if (!o) {
    return (
      <div className="card mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-semibold">Order not found</p>
        <p className="mt-1 text-sm text-text2">{id} is not in the list.</p>
        <Link href="/dashboard/orders" className="btn-primary mt-4">Back to orders</Link>
      </div>
    );
  }

  const current = stages.find((s) => s.id === o.status)!.step;
  const failed = o.status === "failed";
  const nx = next[o.status];
  const run = (to: Status) => {
    const r = moveOrder(o.id, to);
    setMsg(r.ok ? { text: "Updated. The customer's tracker has changed.", bad: false } : { text: r.reason, bad: true });
  };

  return (
    <>
      <PageHead
        title={`Order ${o.id}`}
        sub={`${o.channel} · ${o.branch} branch · Agent ${o.agent}`}
        actions={<Pill tone={o.pay === "pending" ? "warn" : o.balance > 0 ? "warn" : "ok"}>{o.pay === "pending" ? "Pending check" : o.balance > 0 ? `Balance GHS ${o.balance} due` : "Paid in full"}</Pill>}
      />
      <p className="-mt-3 mb-4 text-sm"><Link href="/dashboard/orders" className="text-navy underline">‹ All orders</Link></p>

      {msg && <p role={msg.bad ? "alert" : "status"} className={`mb-4 rounded-[12px] px-4 py-3 text-sm font-medium ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      {failed && <p role="alert" className="mb-4 rounded-[12px] bg-[#fbe4e4] px-4 py-3 text-sm font-medium text-error">Delivery attempt failed. Reschedule or move it back to Out for delivery.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4">
            <h2 className="font-semibold">Order</h2>
            <p className="mt-2 text-sm">{o.items}</p>
            <p className="text-sm text-text2">{o.customer} · {o.place}</p>
            <p className="mt-2 text-sm"><b>GHS {o.total}</b> total · {o.payNote}</p>
          </section>

          <section className="card p-4">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {trackerSteps.map((s, i) => {
                const n = i + 1;
                const done = n < current || (o.status === "delivered" && n === 8);
                const cur = n === current && o.status !== "delivered";
                return (
                  <li key={s.label} className="flex gap-3" aria-current={cur ? "step" : undefined}>
                    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-navy text-lime" : cur ? "bg-white text-navy ring-2 ring-navy" : "bg-line text-muted"}`}>{done ? "✓" : n}</span>
                    <span className={!done && !cur ? "text-muted" : ""}><b>{s.label}</b></span>
                  </li>
                );
              })}
            </ol>
            {o.log.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold">Activity</h3>
                <ul className="mt-2 space-y-1 text-sm text-text2">
                  {o.log.map((l, i) => <li key={i}><span className="font-medium text-ink">{l.at}</span> · {l.text}</li>)}
                </ul>
              </>
            )}
          </section>
        </div>

        <section className="card h-fit space-y-3 p-4">
          <h2 className="font-semibold">Actions</h2>
          {o.pay === "pending" && <button type="button" className="btn-primary w-full" onClick={() => { confirmPayment(o.id); setMsg({ text: "Payment confirmed.", bad: false }); }}>Confirm manual MoMo payment</button>}
          {nx && o.pay !== "pending" && <button type="button" className="btn-primary w-full" onClick={() => run(nx.to)}>{nx.label}</button>}
          {o.balance > 0 && <button type="button" className="btn-outline w-full" onClick={() => { recordBalance(o.id); setMsg({ text: `Balance of GHS ${o.balance} recorded as collected.`, bad: false }); }}>Record balance collected · GHS {o.balance}</button>}
          {(o.status === "out" || o.status === "dispatched") && <button type="button" className="btn-outline w-full" onClick={() => run("failed")}>Delivery failed</button>}
          {failed && <button type="button" className="btn-outline w-full" onClick={() => run("out")}>Reschedule: out for delivery</button>}

          {o.status !== "awaiting_payment" && o.status !== "to_confirm" && o.status !== "delivered" && (
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-medium">Move back (Admin)</summary>
              <div className="mt-2 space-y-2">
                <select aria-label="Move back to" className="field !min-h-10" value={back?.to ?? ""} onChange={(e) => setBack({ to: e.target.value as Status, reason: back?.reason ?? "" })}>
                  <option value="">Choose a stage</option>
                  {stages.filter((s) => s.step < current && s.id !== "failed").map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <input aria-label="Reason" className="field !min-h-10" placeholder="Reason (required)" value={back?.reason ?? ""} onChange={(e) => setBack({ to: back?.to ?? ("" as Status), reason: e.target.value })} />
                <button type="button" className="btn-outline w-full !min-h-10" disabled={!back?.to || !back.reason.trim()} onClick={() => { moveBack(o.id, back!.to, back!.reason.trim()); setBack(null); setMsg({ text: `Moved back to ${stageTitle(back!.to)}. Logged with your reason.`, bad: false }); }}>Move back</button>
              </div>
            </details>
          )}

          <h2 className="border-t border-line pt-3 font-semibold">Notes</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { addNote(o.id, note.trim()); setNote(""); } }} className="space-y-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="field min-h-20 py-2" placeholder="Add an internal note" aria-label="Note" />
            <button className="btn-outline w-full !min-h-10" disabled={!note.trim()}>Add note</button>
          </form>
          {o.notes.length > 0 && <ul className="space-y-2 text-sm">{o.notes.map((n, i) => <li key={i} className="rounded-[10px] bg-card p-2">{n}</li>)}</ul>}
        </section>
      </div>
    </>
  );
}
