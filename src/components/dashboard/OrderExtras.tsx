"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignRiderAction, deliverAction, paymentLinkAction, reassignAction, sourcingOutcomeAction, supportReplyAction, type ActionResult,
} from "@/app/dashboard/orders/actions";
import type { OrderExtras as Data } from "@/lib/orders/extras";

type Msg = { text: string; bad?: boolean } | null;
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * The rest of the order actions (PRD FR-ORD-003): documents, payment link and QR, rider or courier, delivery with the
 * customer's code or a photo (Admin override with a reason), the could-not-source outcome, reassigning the agent,
 * and the customer's messages about this order.
 */
export function OrderExtras({ d }: { d: Data }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [rider, setRider] = useState(d.riderId ?? "");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [agent, setAgent] = useState(d.agentId ?? "");
  const [alt, setAlt] = useState("");
  const [link, setLink] = useState<{ url: string; qr: string; amount: number } | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const onWay = d.status === "dispatched" || d.status === "out_for_delivery";
  const owing = d.balance > 0 || d.status === "awaiting_payment";

  const run = (fn: () => Promise<ActionResult>, ok: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { text: ok } : { text: r.error, bad: true });
    if (r.ok) router.refresh();
  });

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm lg:col-span-2 ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}

      <section className="card space-y-2 p-4 text-sm">
        <h2 className="font-semibold">Documents</h2>
        <div className="flex flex-wrap gap-2">
          <a className="btn-outline !min-h-10" href={`/api/documents?kind=receipt&order=${d.orderId}`} target="_blank" rel="noopener">Receipt (PDF)</a>
          <a className="btn-outline !min-h-10" href={`/api/documents?kind=slip&order=${d.orderId}`} target="_blank" rel="noopener">Packing slip</a>
          <a className="btn-outline !min-h-10" href={`/api/documents?kind=label&order=${d.orderId}`} target="_blank" rel="noopener">Delivery label with QR</a>
        </div>
      </section>

      {d.rights.edit && owing && !["cancelled", "delivered"].includes(d.status) && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Payment link</h2>
          <p className="text-text2">A Paystack link for what is still owed. Paste it into WhatsApp, or show the QR code.</p>
          {link ? (
            <div className="flex flex-wrap items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={link.qr} alt="QR code for the payment link" className="size-32 rounded-[8px] border border-line" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-all text-xs">{link.url}</p>
                <p>GHS {link.amount.toLocaleString("en-GH")}</p>
                <button type="button" className="btn-outline !min-h-9" onClick={() => { void navigator.clipboard.writeText(link.url); setMsg({ text: "Link copied." }); }}>Copy link</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={pending} className="btn-primary !min-h-10" onClick={() => start(async () => { const r = await paymentLinkAction(d.orderId); if (r.ok) setLink(r); else setMsg({ text: r.error, bad: true }); })}>Create payment link</button>
          )}
        </section>
      )}

      {d.rights.full && !["cancelled", "delivered"].includes(d.status) && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Rider or courier</h2>
          <select className="field" value={rider} onChange={(e) => setRider(e.target.value)} aria-label="Rider or courier">
            <option value="">Not assigned</option>{d.riders.map((r) => <option key={r.id} value={r.id}>{r.name}{r.company ? ` · ${r.company}` : ""} ({r.kind})</option>)}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="field" value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier (optional)" aria-label="Courier" />
            <input className="field" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number (optional)" aria-label="Tracking number" />
          </div>
          <button type="button" disabled={pending} className="btn-primary !min-h-10" onClick={() => run(() => assignRiderAction(d.orderId, rider || null, courier, tracking), "Delivery assigned. The rider sees it in their portal.")}>Assign</button>
          {d.riders.length === 0 && <p className="text-xs text-text2">Add riders and couriers in Settings → Riders.</p>}
        </section>
      )}

      {d.rights.edit && onWay && (
        <form className="card space-y-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => deliverAction(d.orderId, fd), "Delivered. The customer has been told."); }}>
          <h2 className="font-semibold">Mark delivered</h2>
          <p className="text-text2">Ask the customer for their 4-digit delivery code{d.codeRequired ? " (required)" : ""}, or add a photo of the handover.{d.balance > 0 ? ` Record the balance of GHS ${d.balance} first.` : ""}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="code" className="field" inputMode="numeric" maxLength={4} placeholder="Delivery code" aria-label="Delivery code" />
            <input name="proof" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="field py-2" aria-label="Photo proof" />
          </div>
          {d.rights.admin && <input name="override" className="field" placeholder="Admin override: reason (only if needed)" aria-label="Override reason" />}
          <button disabled={pending} className="btn-primary !min-h-10">Mark delivered</button>
        </form>
      )}

      {(d.rights.source || d.rights.full) && d.failedItems > 0 && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Could not source {d.failedItems} item(s)</h2>
          <p className="text-text2">Tell the customer straight away: offer an alternative or a full refund (FR-CO-011).{d.outcome ? ` Current: ${d.outcome.replace(/_/g, " ")}.` : ""}</p>
          <input className="field" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="The alternative, for example: Nike Dunk Low Panda, same size" aria-label="Alternative" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className="btn-primary !min-h-10" onClick={() => run(() => sourcingOutcomeAction(d.orderId, "alternative_offered", alt), "Alternative offered. The customer has been told.")}>Offer alternative</button>
            {d.outcome === "alternative_offered" && <button type="button" disabled={pending} className="btn-outline !min-h-10" onClick={() => run(() => sourcingOutcomeAction(d.orderId, "alternative_accepted", alt), "Accepted. Place a new supplier order.")}>Customer accepted</button>}
            <button type="button" disabled={pending} className="btn-outline !min-h-10 !text-error" onClick={() => run(() => sourcingOutcomeAction(d.orderId, "refund"), "Refund requested for the full amount paid. Finance will approve and pay it.")}>Refund instead</button>
          </div>
        </section>
      )}

      {d.rights.admin && d.agents.length > 0 && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Sales agent (gets credit)</h2>
          <div className="flex gap-2">
            <select className="field" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent"><option value="">Nobody</option>{d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <button type="button" disabled={pending || !agent} className="btn-primary !min-h-12" onClick={() => run(() => reassignAction(d.orderId, agent), "Reassigned. They have been told.")}>Reassign</button>
          </div>
        </section>
      )}

      {d.rights.reply && (
        <section className="card space-y-3 p-4 text-sm lg:col-span-2">
          <h2 className="font-semibold">Customer messages</h2>
          {d.threads.length === 0 && <p className="text-text2">No messages about this order. Customers can write from the tracking page or their account.</p>}
          {d.threads.map((t) => (
            <div key={t.id}>
              <p className="font-medium">{t.subject} <span className="chip ml-1 bg-card text-text2">{t.status}</span></p>
              <ul className="mt-2 space-y-2">
                {t.messages.map((m, i) => (
                  <li key={i} className={`max-w-[85%] rounded-[12px] px-3 py-2 ${m.from_staff ? "ml-auto bg-navy text-white" : "bg-card"}`}>
                    <p>{m.body}</p><p className={`mt-1 text-[11px] ${m.from_staff ? "text-white/70" : "text-text2"}`}>{m.author_name} · {day(m.at)}</p>
                  </li>
                ))}
              </ul>
              <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => supportReplyAction(t.id, reply[t.id] ?? ""), "Reply sent and emailed to the customer."); setReply((x) => ({ ...x, [t.id]: "" })); }}>
                <input className="field min-w-0 flex-1" value={reply[t.id] ?? ""} onChange={(e) => setReply((x) => ({ ...x, [t.id]: e.target.value }))} placeholder="Reply to the customer" aria-label="Reply" />
                <button disabled={pending} className="btn-primary">Send</button>
                <button type="button" disabled={pending} className="btn-outline" onClick={() => run(() => supportReplyAction(t.id, reply[t.id] ?? "", true), "Conversation closed.")}>{reply[t.id] ? "Send and close" : "Close"}</button>
              </form>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
