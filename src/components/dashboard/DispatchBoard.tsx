"use client";

import Link from "next/link";
import { useState } from "react";
import { stages, type DashOrder, type Status } from "@/lib/orders/dash-types";
import { useOrdersApi } from "@/lib/orders/api";

const columns = stages.filter((s) => s.id !== "awaiting_payment" && s.id !== "to_confirm" && s.id !== "cancelled");

export function DispatchBoard({ mode, initial }: { mode: "db" | "demo"; initial: DashOrder[] }) {
  const { orders, move: doMove } = useOrdersApi(mode, initial);
  const [branch, setBranch] = useState<"All branches" | "Accra" | "Kumasi">("All branches");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);

  const visible = orders.filter(
    (o) => (branch === "All branches" || o.branch === branch) && (!q || `${o.id} ${o.customer} ${o.place} ${o.items}`.toLowerCase().includes(q.toLowerCase())),
  );
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Branch">
          {(["All branches", "Accra", "Kumasi"] as const).map((b) => (
            <button key={b} type="button" aria-pressed={branch === b} onClick={() => setBranch(b)} className={`chip min-h-9 px-3 text-sm ${branch === b ? "bg-navy text-white" : "bg-white text-navy"}`}>{b}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an order or customer" aria-label="Find an order or customer" className="field !min-h-9 max-w-xs flex-1" />
        {before > 0 && <Link href="/dashboard/orders" className="text-sm text-text2 underline">{before} earlier {before === 1 ? "order is" : "orders are"} still being paid or confirmed</Link>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((c) => {
          const cards = visible.filter((o) => o.status === c.id);
          const isOver = over === c.id && drag;
          return (
            <section
              key={c.id}
              aria-label={c.title}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.id);
              }}
              onDragLeave={() => setOver((x) => (x === c.id ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || drag;
                setOver(null);
                setDrag(null);
                if (id) move(id, c.id);
              }}
              className={`w-72 shrink-0 rounded-[12px] p-2 transition-colors ${isOver ? "bg-[#dfe6fb] ring-2 ring-navy" : "bg-white/60"}`}
            >
              <h2 className="flex items-center justify-between px-2 py-1 text-sm font-semibold">
                {c.title} <span className="rounded-full bg-white px-2 text-xs text-text2">{cards.length}</span>
              </h2>
              <div className="min-h-24 space-y-2">
                {cards.map((k) => (
                  <Card key={k.id} o={k} dragging={drag === k.id} onDragStart={() => setDrag(k.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onMove={(to) => move(k.id, to)} />
                ))}
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

function Card({ o, dragging, onDragStart, onDragEnd, onMove }: { o: DashOrder; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (to: Status) => void }) {
  // every stage is listed so a blocked move can explain why, instead of silently missing from the list
  const valid = stages.filter((s) => s.id !== o.status);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", o.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`card cursor-grab p-3 text-sm active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
    >
      <p className="flex justify-between gap-2">
        <Link href={`/dashboard/orders/${o.id}`} className="font-bold text-navy hover:underline">{o.id}</Link>
        <span className={`text-xs ${o.late ? "font-semibold text-error" : "text-text2"}`}>{o.age}{o.late ? " · late" : ""}</span>
      </p>
      <p className="font-medium">{o.customer} · {o.place}</p>
      <p className="text-text2">{o.items}</p>
      <p className={`mt-2 rounded px-1.5 py-0.5 text-xs font-medium ${o.balance > 0 ? "bg-[#fbeedb] text-warning" : "bg-card text-text2"}`}>
        {o.balance > 0 ? `${o.payNote} · collect GHS ${o.balance}` : o.payNote}
      </p>
      {o.courier && <p className="mt-1 text-xs text-text2">{o.courier}</p>}
      <label className="mt-2 block">
        <span className="sr-only">Move {o.id} to</span>
        <select
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value as Status)}
          className="min-h-9 w-full rounded-[10px] border border-line bg-white px-2 text-xs text-text2"
        >
          <option value="">Move to…</option>
          {valid.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>
    </article>
  );
}
