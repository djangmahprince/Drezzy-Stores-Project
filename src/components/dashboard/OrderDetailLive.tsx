"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addNoteAction, advanceOrderAction, moveBackAction, recordBalanceAction, recordPaymentAction, reviewPaymentAction, updateDeliveryAction, type ActionResult,
} from "@/app/dashboard/orders/actions";
import { PageHead, Pill } from "@/components/dashboard/DashShell";
import { formatGHS } from "@/lib/data";
import { stages, statusFromDb, stageTitle, type Status } from "@/lib/orders/dash-types";
import type { OrderDetail } from "@/lib/orders/staff";

const next: Partial<Record<Status, { to: Status; label: string }>> = {
  to_confirm: { to: "to_source", label: "Confirm order" },
  to_source: { to: "ready_to_pack", label: "Mark received from supplier" },
  ready_to_pack: { to: "packed", label: "Pack and check" },
  packed: { to: "dispatched", label: "Dispatch" },
  dispatched: { to: "out", label: "Out for delivery" },
  out: { to: "delivered", label: "Mark delivered" },
};

const payTone = { paid: "ok", part_paid: "warn", pending_check: "warn", unpaid: "info", failed: "bad", partly_refunded: "warn", refunded: "info" } as const;
const payWord: Record<string, string> = { paid: "Paid in full", part_paid: "Part paid", pending_check: "Pending check", unpaid: "Unpaid", failed: "Failed", partly_refunded: "Partly refunded", refunded: "Refunded" };
const channelWord: Record<string, string> = { web: "Web", whatsapp: "WhatsApp", phone: "Phone", instagram_dm: "Instagram DM", walk_in: "Walk-in" };

export function OrderDetailLive({ d }: { d: OrderDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [back, setBack] = useState({ to: "" as Status | "", reason: "" });
  const [pay, setPay] = useState<{ kind: "payment" | "balance" | null; method: "momo" | "cash"; ref: string }>({ kind: null, method: "cash", ref: "" });
  const [del, setDel] = useState({ courier: d.courier ?? "", tracking: d.tracking ?? "", riderName: d.rider.name ?? "", riderPhone: d.rider.phone ?? "" });

  const status = statusFromDb(d.status);
  const r = d.rights;
  const final = status === "delivered" || status === "cancelled";
  const nx = next[status];

  /** Runs an order action and shows what the database said. A refusal is shown as the reason, not hidden. */
  function run(fn: () => Promise<ActionResult>, ok: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { text: ok, bad: false } : { text: res.error, bad: true });
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <>
      <PageHead
        real
        title={`Order ${d.number}`}
        sub={`${channelWord[d.channel] ?? d.channel} · ${d.branch === "kumasi" ? "Kumasi" : "Accra"} branch${d.agent ? ` · Agent ${d.agent}` : ""}`}
        actions={<><Pill tone="info">{stageTitle(status)}</Pill><Pill tone={payTone[d.paymentState as keyof typeof payTone] ?? "info"}>{payWord[d.paymentState] ?? d.paymentState}</Pill></>}
      />
      <p className="-mt-3 mb-4 text-sm"><Link href="/dashboard/orders" className="text-navy underline">‹ All orders</Link></p>

      {msg && <p role={msg.bad ? "alert" : "status"} className={`mb-4 rounded-[12px] px-4 py-3 text-sm font-medium ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      {d.paymentState === "pending_check" && <p role="status" className="mb-4 rounded-[12px] bg-[#fbeedb] px-4 py-3 text-sm font-medium text-warning">A manual MoMo payment is waiting to be matched to the statement before this order can move.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
              <h2 className="font-semibold">Customer</h2>
              <p className="mt-1">{d.customer.name}</p>
              <p className="text-text2">{d.customer.phone}{d.customer.email ? ` · ${d.customer.email}` : ""}</p>
              {d.source && <p className="mt-1 text-xs text-text2">Heard of Drezzy: {d.source}</p>}
            </div>
            <div>
              <h2 className="font-semibold">{d.method === "pickup" ? "Pickup" : "Deliver to"}</h2>
              {d.receiver.name && <p className="mt-1">{d.receiver.name}{d.receiver.phone ? ` · ${d.receiver.phone}` : ""} <span className="text-xs text-text2">(gift)</span></p>}
              <p className="mt-1">{d.address.join(", ")}</p>
              {d.riderNote && <p className="text-xs text-text2">Note for the rider: {d.riderNote}</p>}
              {d.estDelivery && <p className="text-xs text-text2">Estimated: {d.estDelivery}</p>}
            </div>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-semibold">Items</h2>
            <ul className="mt-2 divide-y divide-line">
              {d.items.map((i, n) => <li key={n} className="flex justify-between gap-3 py-2"><span>{i.name}<br /><span className="text-text2">{i.label} · Qty {i.qty}</span></span><span className="font-semibold">{formatGHS(i.unit * i.qty)}</span></li>)}
            </ul>
            <dl className="mt-2 space-y-1 border-t border-line pt-3">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatGHS(d.money.subtotal)}</dd></div>
              <div className="flex justify-between text-text2"><dt>Delivery</dt><dd>{formatGHS(d.money.fee)}</dd></div>
              {d.money.discount > 0 && <div className="flex justify-between text-success"><dt>Discount{d.money.discountReason ? ` (${d.money.discountReason})` : ""}</dt><dd>−{formatGHS(d.money.discount)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatGHS(d.money.total)}</dd></div>
              <div className="flex justify-between"><dt>Paid</dt><dd>{formatGHS(d.money.paid)}</dd></div>
              {d.money.balance > 0 && <div className="flex justify-between font-semibold text-warning"><dt>Balance to collect</dt><dd>{formatGHS(d.money.balance)}</dd></div>}
            </dl>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-semibold">Payments</h2>
            {d.payments.length === 0 ? <p className="mt-2 text-text2">No payments yet.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <b>{formatGHS(p.amount)}</b> · {p.kind === "balance" ? "Balance" : "Checkout"} · {p.method ?? p.provider}
                      <br /><span className="text-xs text-text2">{p.at} · {p.txn ? `Txn ${p.txn} · ` : ""}{p.reference}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Pill tone={p.status === "success" ? "ok" : p.status === "failed" ? "bad" : "warn"}>{p.status === "pending_check" ? "Needs check" : p.status}</Pill>
                      {p.status === "pending_check" && r.canReviewPayments && (
                        <>
                          <button type="button" disabled={pending} className="btn-primary !min-h-9 text-xs" onClick={() => run(() => reviewPaymentAction(p.id, true), "Payment confirmed.")}>Confirm</button>
                          <button type="button" disabled={pending} className="btn-outline !min-h-9 text-xs" onClick={() => run(() => reviewPaymentAction(p.id, false), "Payment rejected.")}>Reject</button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {d.events.map((e, n) => (
                <li key={n} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.kind === "override" ? "bg-warning" : "bg-navy"}`} aria-hidden="true" />
                  <span>
                    <b>{e.publicNote ?? e.internalNote ?? e.kind}</b>
                    {e.publicNote && e.internalNote && <span className="text-text2"> · {e.internalNote}</span>}
                    <br /><span className="text-xs text-text2">{e.at}{e.actor ? ` · ${e.actor}` : ""}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="h-fit space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Actions</h2>
            {final && <p className="text-sm text-text2">This order is {status === "delivered" ? "delivered" : "cancelled"}. It cannot change.</p>}

            {!final && r.canEdit && (
              <>
                {d.paymentState === "unpaid" && (
                  <div className="space-y-2 rounded-[12px] bg-card p-3">
                    <p className="text-sm font-medium">Payment not received yet</p>
                    <div className="flex gap-2">
                      <select aria-label="Payment method" value={pay.kind === "payment" ? pay.method : "cash"} onChange={(e) => setPay({ kind: "payment", method: e.target.value as "momo" | "cash", ref: pay.ref })} className="min-h-10 flex-1 rounded-[10px] border border-line bg-white px-2 text-sm">
                        <option value="cash">Cash</option><option value="momo">MoMo transfer</option>
                      </select>
                      {pay.kind === "payment" && pay.method === "momo" && <input aria-label="MoMo transaction ID" placeholder="Transaction ID" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className="min-h-10 flex-1 rounded-[10px] border border-line bg-white px-2 text-sm" />}
                    </div>
                    <button type="button" disabled={pending} className="btn-primary w-full !min-h-10" onClick={() => run(() => recordPaymentAction(d.id, pay.kind === "payment" ? pay.method : "cash", pay.ref), "Payment recorded.")}>Record the payment received</button>
                  </div>
                )}

                {nx && d.paymentState !== "unpaid" && d.paymentState !== "pending_check" && (
                  <button type="button" disabled={pending} className="btn-primary w-full" onClick={() => run(() => advanceOrderAction(d.id, nx.to), "Updated. The customer's tracker has changed.")}>{nx.label}</button>
                )}

                {d.money.balance > 0 && d.paymentState !== "unpaid" && (
                  <div className="space-y-2 rounded-[12px] bg-card p-3">
                    <p className="text-sm font-medium">Balance to collect: {formatGHS(d.money.balance)}</p>
                    <div className="flex gap-2">
                      <select aria-label="Balance method" value={pay.kind === "balance" ? pay.method : "cash"} onChange={(e) => setPay({ kind: "balance", method: e.target.value as "momo" | "cash", ref: pay.ref })} className="min-h-10 flex-1 rounded-[10px] border border-line bg-white px-2 text-sm">
                        <option value="cash">Cash</option><option value="momo">MoMo</option>
                      </select>
                      {pay.kind === "balance" && pay.method === "momo" && <input aria-label="MoMo reference" placeholder="MoMo reference" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className="min-h-10 flex-1 rounded-[10px] border border-line bg-white px-2 text-sm" />}
                    </div>
                    <button type="button" disabled={pending} className="btn-outline w-full !min-h-10" onClick={() => run(() => recordBalanceAction(d.id, pay.kind === "balance" ? pay.method : "cash", pay.ref), "Balance recorded as collected.")}>Record balance collected</button>
                  </div>
                )}

                {(status === "dispatched" || status === "out") && <button type="button" disabled={pending} className="btn-outline w-full !min-h-10" onClick={() => run(() => advanceOrderAction(d.id, "failed"), "Marked as a failed delivery.")}>Delivery failed</button>}
                {status === "failed" && <button type="button" disabled={pending} className="btn-outline w-full !min-h-10" onClick={() => run(() => advanceOrderAction(d.id, "out"), "Rescheduled: out for delivery.")}>Reschedule: out for delivery</button>}
                <button type="button" disabled={pending} className="w-full text-sm text-error underline" onClick={() => { if (window.confirm(`Cancel ${d.number}? ${d.money.paid > 0 ? "It has been paid, so a refund must be arranged." : ""}`)) run(() => advanceOrderAction(d.id, "cancelled", "Cancelled by staff"), "Order cancelled."); }}>Cancel this order</button>
              </>
            )}

            {r.canOverride && status !== "awaiting_payment" && status !== "to_confirm" && !final && (
              <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium">Move back (Admin)</summary>
                <div className="mt-2 space-y-2">
                  <select aria-label="Move back to" className="field !min-h-10" value={back.to} onChange={(e) => setBack({ ...back, to: e.target.value as Status })}>
                    <option value="">Choose a stage</option>
                    {stages.filter((s) => s.step < (stages.find((x) => x.id === status)?.step ?? 0) && s.id !== "failed" && s.id !== "cancelled").map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <input aria-label="Reason" className="field !min-h-10" placeholder="Reason (required, and kept on the timeline)" value={back.reason} onChange={(e) => setBack({ ...back, reason: e.target.value })} />
                  <button type="button" className="btn-outline w-full !min-h-10" disabled={!back.to || !back.reason.trim() || pending} onClick={() => run(() => moveBackAction(d.id, back.to as Status, back.reason.trim()), "Moved back. Logged with your reason.", () => setBack({ to: "", reason: "" }))}>Move back</button>
                </div>
              </details>
            )}
          </section>

          {r.canEdit && !final && (
            <section className="card space-y-2 p-4">
              <h2 className="font-semibold">Delivery details</h2>
              {([["courier", "Courier"], ["tracking", "Tracking number"], ["riderName", "Rider name"], ["riderPhone", "Rider phone"]] as const).map(([k, label]) => (
                <label key={k} className="block text-sm"><span className="mb-1 block text-text2">{label}</span>
                  <input className="field !min-h-10" value={del[k]} onChange={(e) => setDel({ ...del, [k]: e.target.value })} />
                </label>
              ))}
              <button type="button" disabled={pending} className="btn-outline w-full !min-h-10" onClick={() => run(() => updateDeliveryAction(d.id, del), "Delivery details saved. The customer can see the rider or courier.")}>Save delivery details</button>
            </section>
          )}

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Notes</h2>
            {r.canEdit && (
              <form onSubmit={(e) => { e.preventDefault(); run(() => addNoteAction(d.id, note), "Note added.", () => setNote("")); }} className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} className="field min-h-20 py-2" placeholder="Add an internal note" aria-label="Note" />
                <button className="btn-outline w-full !min-h-10" disabled={!note.trim() || pending}>Add note</button>
              </form>
            )}
            {d.notes.length === 0 ? <p className="text-sm text-text2">No notes.</p> : (
              <ul className="space-y-2 text-sm">{d.notes.map((n, i) => <li key={i} className="rounded-[10px] bg-card p-2">{n.body}<br /><span className="text-xs text-text2">{n.author ?? "Staff"} · {n.at}</span></li>)}</ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
