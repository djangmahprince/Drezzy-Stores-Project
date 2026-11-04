"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { trackOrderAction } from "@/app/(store)/checkout/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { Icon } from "@/components/Icon";
import { TrackExtras } from "@/components/store/TrackExtras";
import { waNumber } from "@/lib/media";
import { branches, formatGHS } from "@/lib/data";
import { phoneKey, useOrders, type PlacedOrder } from "@/lib/orders";
import { buildTrack, type TrackJson, type TrackView as View } from "@/lib/orders/track";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// ---- demo mode: example data run through the same mapper the live tracker uses ----
const EXAMPLE: TrackJson = {
  number: "DRZ-1027", placed_at: "2026-10-21T09:12:00Z", status: "out_for_delivery", payment_state: "paid", plan: "full", total: 430,
  amount_paid: 430, balance_due: 0, est_delivery_date: "2026-10-21", delivery_method: "home", region: "Ashanti", city: "Kumasi", area: "Adum",
  receiver_name: "Ama Mensah", courier: null, tracking_number: null, rider_name: "Yaw", rider_phone: "020 000 0000", branch: "kumasi",
  items: [{ name: 'Air Jordan 1 Retro High OG "Triple Black"', detail: "Triple Black · Size 42", qty: 1 }],
  events: [
    { kind: "payment", status: "to_confirm", at: "2026-10-21T09:13:00Z", note: "Payment confirmed", by: "" },
    { kind: "status", status: "to_source", at: "2026-10-21T09:31:00Z", note: "Confirmed by Drezzy", by: "Kwame" },
    { kind: "status", status: "ready_to_pack", at: "2026-10-21T10:20:00Z", note: "Item received at our branch", by: "Adjoa" },
    { kind: "status", status: "packed", at: "2026-10-21T10:40:00Z", note: "Checked and packed", by: "Yaw" },
    { kind: "status", status: "dispatched", at: "2026-10-21T11:05:00Z", note: "Dispatched", by: "Yaw" },
  ],
  payments: [{ kind: "checkout", method: "mtn", amount: 430, at: "2026-10-21T09:13:00Z" }],
};

function fromLocal(o: PlacedOrder): TrackJson {
  return {
    number: o.id, placed_at: o.placedAt, status: "to_confirm", payment_state: o.balance > 0 ? "part_paid" : "paid", plan: o.plan, total: o.total,
    amount_paid: o.paid, balance_due: o.balance, est_delivery_date: null, delivery_method: o.method, region: o.region, city: o.city, area: o.area,
    receiver_name: o.name, courier: null, tracking_number: null, rider_name: null, rider_phone: null, branch: o.region === "Ashanti" ? "kumasi" : "accra",
    items: o.items.map((i) => ({ name: i.name, detail: i.detail, qty: i.qty })),
    events: [{ kind: "payment", status: "to_confirm", at: o.placedAt, note: "Payment confirmed", by: "" }],
    payments: [{ kind: "checkout", method: o.payMethod.includes("MTN") ? "mtn" : o.payMethod.includes("Telecel") ? "telecel" : o.payMethod.includes("Airtel") ? "airtel" : "card", amount: o.paid, at: o.placedAt }],
  };
}

export function TrackView({ initialOrder = "", initialPhone = "" }: { initialOrder?: string; initialPhone?: string }) {
  const local = useOrders();
  const [orderNo, setOrderNo] = useState(initialOrder);
  const [phone, setPhone] = useState(initialPhone);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [foundPhone, setFoundPhone] = useState("");
  const [pending, start] = useTransition();
  const lookedUp = useRef<{ o: string; p: string } | null>(null);

  async function lookup(o: string, p: string) {
    lookedUp.current = { o, p };
    setSearched(true);
    if (isSupabaseConfigured) {
      const r = await trackOrderAction({ number: o, phone: p });
      if (r.ok) {
        setView(r.track);
        setFoundPhone(p);
        setError(null);
      } else {
        setView(null);
        setError(r.error);
      }
      return;
    }
    const id = o.trim().toUpperCase();
    const key = phoneKey(p);
    const json = id === EXAMPLE.number && key === "240000000" ? EXAMPLE : (() => { const hit = local.find((x) => x.id === id && phoneKey(x.phone) === key); return hit ? fromLocal(hit) : null; })();
    setView(json ? buildTrack(json) : null);
    setError(json ? null : "We could not find that order. Check the order number and the phone number you used at checkout.");
  }

  const go = (o: string, p: string) => start(() => lookup(o, p));

  // opened from a link that already carries the order and phone (confirmation page, account)
  useEffect(() => {
    if (initialOrder && initialPhone) go(initialOrder, initialPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep a live order fresh while it is open
  useEffect(() => {
    if (!isSupabaseConfigured || !view || view.stepNumber >= 8) return;
    const id = window.setInterval(() => {
      const last = lookedUp.current;
      if (last && document.visibilityState === "visible") void lookup(last.o, last.p);
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.number, view?.stepNumber]);

  const { site } = useCatalogue();
  const wa = (v: View) => `https://wa.me/${site ? waNumber(v.helpBranch === "kumasi" ? site.kumasi.whatsapp : site.accra.whatsapp) : branches[v.helpBranch].wa}?text=${encodeURIComponent(`Hi Drezzy, I need help with ${v.number}`)}`;

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={(e) => { e.preventDefault(); go(orderNo, phone); }} className="card p-5">
        <h1 className="text-xl font-bold">Track your order</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="t-order" className="mb-1 block text-sm font-medium">Order number</label>
            <input id="t-order" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} className="field" placeholder="DRZ-1027" autoCapitalize="characters" required />
          </div>
          <div>
            <label htmlFor="t-phone" className="mb-1 block text-sm font-medium">Phone number</label>
            <input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" placeholder="024 000 0000" type="tel" inputMode="tel" required />
          </div>
          <button disabled={pending} className="btn-primary self-end disabled:opacity-60">{pending ? "Looking…" : "Find order"}</button>
        </div>
        <p className="mt-3 text-xs text-text2">Anyone with the order number and phone number can open this page. No login needed.</p>
        {!isSupabaseConfigured && (
          <button type="button" onClick={() => { setOrderNo("DRZ-1027"); setPhone("024 000 0000"); go("DRZ-1027", "024 000 0000"); }} className="mt-2 text-sm font-medium text-navy underline">
            Try an example order
          </button>
        )}
      </form>

      {searched && !pending && error && !view && (
        <div role="alert" className="card mt-6 border-error/40 p-5">
          <p className="font-semibold text-error">{error.startsWith("We could not find") ? "We could not find that order." : error}</p>
          {error.startsWith("We could not find") && <p className="mt-1 text-sm text-text2">Check the order number and the phone number you used at checkout. Still stuck? WhatsApp us and we will find it for you.</p>}
          <a href={`https://wa.me/${branches.accra.wa}`} target="_blank" rel="noopener noreferrer" className="btn-outline mt-3">WhatsApp {branches.accra.whatsapp}</a>
        </div>
      )}

      {view && (
        <div className="mt-8">
          <p className="text-sm text-text2">Order {view.number} · placed {view.placed}</p>
          <h2 className="mt-1 text-[36px] font-extrabold uppercase leading-none text-navy md:text-[48px]">{view.headline}</h2>
          {view.eta && <p className="mt-2 text-lg">{view.eta}</p>}
          <p className="mt-1 text-sm text-text2">Step {view.stepNumber} of 8</p>

          {view.banner && (
            <p role={view.banner.tone === "bad" ? "alert" : "status"} className={`mt-4 rounded-[12px] px-4 py-3 text-sm font-medium ${view.banner.tone === "bad" ? "bg-[#fbe4e4] text-error" : view.banner.tone === "warn" ? "bg-[#fbeedb] text-warning" : "bg-[#e6eaf8] text-navy"}`}>
              {view.banner.text}
            </p>
          )}

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={8} aria-valuenow={view.stepNumber} aria-label="Order progress">
            <div className="h-full rounded-full bg-navy transition-all duration-500" style={{ width: `${(view.steps.filter((s) => s.state === "done").length / 8) * 100}%` }} />
          </div>

          <ol className="mt-6 hidden grid-cols-8 gap-1 md:grid">
            {view.steps.map((s, i) => (
              <li key={s.label} className="flex flex-col items-center gap-2 text-center" aria-current={s.state === "current" ? "step" : undefined}>
                <span className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${s.state === "done" ? "bg-navy text-lime" : s.state === "current" ? "bg-white text-navy ring-4 ring-navy" : "bg-line text-muted"}`}>
                  {s.state === "done" ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className={`text-[11px] leading-tight ${s.state !== "todo" ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
              </li>
            ))}
          </ol>

          <ol className="mt-8 space-y-0">
            {view.steps.map((s, i) => (
              <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
                {i < view.steps.length - 1 && <span className={`absolute left-3 top-7 h-[calc(100%-1.75rem)] w-0.5 ${s.state === "done" ? "bg-navy" : "bg-line"}`} aria-hidden="true" />}
                <span className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.state === "done" ? "bg-navy text-lime" : s.state === "current" ? "bg-white text-navy ring-4 ring-navy" : "bg-line text-muted"}`}>
                  {s.state === "done" ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <div>
                  <p className={`font-semibold ${s.state === "todo" ? "text-muted" : ""}`}>{s.label}</p>
                  <p className="text-sm text-text2">{s.note}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="card mt-8 p-5 text-sm">
            <p className="font-semibold">In this order</p>
            {view.items.map((i, idx) => <p key={idx} className="mt-1">{i.name}<br /><span className="text-text2">{i.detail ? `${i.detail} · ` : ""}Qty {i.qty}</span></p>)}
            <p className="mt-4 font-semibold">Delivering to</p>
            <p>{view.deliveringTo}</p>
            {view.balanceDue > 0 && <p className="mt-3 font-medium text-warning">Balance to pay on delivery: {formatGHS(view.balanceDue)}</p>}
          </div>
          <a href={wa(view)} target="_blank" rel="noopener noreferrer" className="btn-lime mt-4 w-full"><Icon name="chat" size={20} /> Need help? WhatsApp us about {view.number}</a>
          {isSupabaseConfigured && foundPhone && <TrackExtras view={view} phone={foundPhone} />}
        </div>
      )}
    </div>
  );
}
