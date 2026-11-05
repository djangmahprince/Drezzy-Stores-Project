"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignRiderAction } from "@/app/dashboard/orders/actions";
import { Segmented } from "@/components/dashboard/DashShell";
import { stages, type DashOrder, type Status } from "@/lib/orders/dash-types";
import { useOrdersApi } from "@/lib/orders/api";

export type Rider = { id: string; name: string; kind: string; company: string | null };

const columns = stages.filter((s) => s.id !== "awaiting_payment" && s.id !== "to_confirm" && s.id !== "cancelled");
const branches = [["all", "All branches"], ["Accra", "Accra"], ["Kumasi", "Kumasi"]] as const;
const selectCls = "min-h-11 rounded-[12px] border border-line bg-white px-3 text-sm font-medium text-ink";
const dashed = "mt-2 flex min-h-10 w-full items-center justify-center rounded-[10px] border border-dashed border-muted bg-white px-2 text-center text-sm font-semibold text-navy";

const regionOf = (o: DashOrder) => o.region ?? o.place.split(", ").pop() ?? o.place;
const carrierOf = (o: DashOrder) => o.rider ?? o.courier;
const isCity = (o: DashOrder) => /accra|kumasi/i.test(o.place);

export function DispatchBoard({ mode, initial, riders = [] }: { mode: "db" | "demo"; initial: DashOrder[]; riders?: Rider[] }) {
  const { orders, move: doMove } = useOrdersApi(mode, initial);
  const router = useRouter();
  const [branch, setBranch] = useState<(typeof branches)[number][0]>("all");
  const [region, setRegion] = useState("");
  const [carrier, setCarrier] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);

  const onBoard = orders.filter((o) => columns.some((c) => c.id === o.status));
  const regions = [...new Set(onBoard.map(regionOf))].sort();
  const carriers = [...new Set(onBoard.map(carrierOf).filter((x): x is string => !!x))].sort();
  const visible = orders.filter((o) => (branch === "all" || o.branch === branch) && (!region || regionOf(o) === region) && (!carrier || carrierOf(o) === carrier) && (!lateOnly || o.late));
  const before = visible.filter((o) => o.status === "awaiting_payment" || o.status === "to_confirm").length;

  function tell(text: string, bad = false) {
    setToast({ text, bad });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function move(id: string, to: Status) {
    const r = await doMove(id, to);
    if (r.ok) tell(`${id} moved. The customer's tracker is updated.`);
    else tell(r.reason, true);
  }

  async function assign(o: DashOrder, riderId: string) {
    if (!o.dbId) return tell("Connect Supabase to assign riders.", true);
    const r = await assignRiderAction(o.dbId, riderId || null);
    if (r.ok) { tell(`${o.id} assigned.`); router.refresh(); } else tell(r.error, true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented options={branches} value={branch} onChange={setBranch} label="Branch" />
        <label className="flex items-center gap-2 text-sm text-text2">Region
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectCls}><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text2">Rider or courier
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={selectCls}><option value="">Everyone</option>{carriers.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label className="ml-auto flex items-center gap-2 text-sm text-text2"><input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} className="size-4 accent-[#b45f06]" /> Waiting longer than the time limit</label>
      </div>
      {before > 0 && <p className="mb-3 text-sm"><Link href="/dashboard/orders" className="text-text2 underline">{before} earlier {before === 1 ? "order is" : "orders are"} still being paid or confirmed</Link></p>}

      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {columns.map((c) => {
          const cards = visible.filter((o) => o.status === c.id);
          return (
            <section key={c.id} aria-label={c.title}
              onDragOver={(e) => { e.preventDefault(); setOver(c.id); }}
              onDragLeave={() => setOver((x) => (x === c.id ? null : x))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || drag; setOver(null); setDrag(null); if (id) void move(id, c.id); }}
              className={`w-[280px] shrink-0 rounded-[16px] p-2.5 transition-colors ${over === c.id && drag ? "bg-[#dfe6fb] ring-2 ring-navy" : "bg-[#e9ebf1]"}`}>
              <h2 className="flex items-center justify-between px-1.5 py-1.5 text-sm font-semibold">{c.title} <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs">{cards.length}</span></h2>
              <div className="mt-1 min-h-24 space-y-2.5">
                {cards.map((k) => <Card key={k.id} o={k} riders={riders} dragging={drag === k.id} onDragStart={() => setDrag(k.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onMove={(to) => void move(k.id, to)} onAssign={(id) => void assign(k, id)} />)}
                {cards.length === 0 && <p className="rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-muted">Drop an order here</p>}
              </div>
            </section>
          );
        })}
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && <p className={`pointer-events-auto max-w-md rounded-[12px] px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.bad ? "bg-error" : "bg-navy"}`}>{toast.text}</p>}
      </div>
    </div>
  );
}

function Card({ o, riders, dragging, onDragStart, onDragEnd, onMove, onAssign }: { o: DashOrder; riders: Rider[]; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (to: Status) => void; onAssign: (riderId: string) => void }) {
  const placeOrder = o.status === "to_source" && !o.supplier;
  const needsCarrier = o.status === "packed" && !carrierOf(o);
  const assignWord = isCity(o) ? "Assign rider" : "Book courier";
  const canAssign = !["delivered", "failed"].includes(o.status) && riders.length > 0;
  return (
    <article draggable onDragEnd={onDragEnd}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      className={`cursor-grab rounded-[12px] bg-white p-3 text-sm active:cursor-grabbing ${o.late ? "border-2 border-warning" : "border border-transparent"} ${dragging ? "opacity-40" : ""}`}>
      <p className="flex justify-between gap-2">
        <Link href={`/dashboard/orders/${o.id}`} className="font-bold text-navy hover:underline">{o.id}</Link>
        <span className={`text-xs ${o.late ? "font-semibold text-warning" : "text-text2"}`}>{o.age}{o.late ? " · late" : ""}</span>
      </p>
      <p className="font-medium">{o.customer} · {o.place}</p>
      <p className="mt-0.5 text-text2">{o.items}</p>
      {o.phone && <p className="text-xs text-text2">Customer: <a href={`tel:${o.phone}`} className="text-navy underline">{o.phone}</a></p>}
      {o.rider && <p className="text-xs text-text2">Rider: {o.rider}{o.riderPhone && <> · <a href={`tel:${o.riderPhone}`} className="text-navy underline">{o.riderPhone}</a></>}</p>}
      <p className="mt-2 flex flex-wrap gap-1.5">
        <span className={`chip !rounded-[6px] !px-2 !py-0.5 ${o.balance > 0 ? "bg-[#fbeedb] text-warning" : "bg-[#e3f5ee] text-success"}`}>{o.balance > 0 ? `Half paid · collect GHS ${o.balance}` : o.payNote}</span>
        <span className="chip !rounded-[6px] bg-navy !px-2 !py-0.5 text-white">{o.branch}</span>
        {o.supplier && o.status === "to_source" && <span className="chip !rounded-[6px] bg-card !px-2 !py-0.5 text-text2">{o.supplier} · ordered</span>}
        {o.courier && <span className="chip !rounded-[6px] bg-card !px-2 !py-0.5 text-text2">{o.courier}</span>}
      </p>
      {placeOrder && <Link href={`/dashboard/orders/${o.id}`} className={dashed}>Place supplier order</Link>}
      {needsCarrier && !canAssign && <Link href={`/dashboard/orders/${o.id}`} className={dashed}>{assignWord}</Link>}
      {canAssign && (needsCarrier || carrierOf(o)) && (
        <label className="block">
          <span className="sr-only">{assignWord} for {o.id}</span>
          <select value={riders.find((r) => r.name === o.rider)?.id ?? ""} onChange={(e) => onAssign(e.target.value)} className={`${dashed} ${needsCarrier ? "" : "!min-h-8 !border-transparent !text-xs !font-normal !text-text2"}`}>
            <option value="">{carrierOf(o) ? "Change rider or courier" : assignWord}</option>
            {riders.map((r) => <option key={r.id} value={r.id}>{r.name}{r.company ? ` (${r.company})` : ""}</option>)}
          </select>
        </label>
      )}
      <label className="mt-1 block">
        <span className="sr-only">Move {o.id} to</span>
        <select value="" onChange={(e) => e.target.value && onMove(e.target.value as Status)} className="min-h-7 w-full bg-transparent text-xs text-muted">
          <option value="">Move to…</option>
          {stages.filter((s) => s.id !== o.status).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>
    </article>
  );
}
