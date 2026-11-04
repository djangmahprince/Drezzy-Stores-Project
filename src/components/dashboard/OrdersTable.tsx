"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill } from "@/components/dashboard/DashShell";
import { ColumnChooser, downloadCsv, SavedViews, serverExport, useColumns } from "@/components/dashboard/ListTools";
import { stages, stageTitle, type DashOrder } from "@/lib/orders/dash-types";
import { useOrdersApi } from "@/lib/orders/api";

const payPill = (o: DashOrder) =>
  o.pay === "pending" ? <Pill tone="warn">Pending check</Pill>
  : o.pay === "unpaid" ? <Pill tone="info">Unpaid</Pill>
  : o.balance > 0 ? <Pill tone="warn">Part paid · GHS {o.balance} due</Pill>
  : <Pill tone="ok">Paid</Pill>;

const ALL = ["Order", "Placed", "Customer", "Items", "Channel", "Region", "Source", "Payment", "Total", "Status", "Agent", "Rider", "Age"];
const DEFAULT = ["Order", "Customer", "Items", "Channel", "Payment", "Status", "Agent"];
type Sort = { col: string; dir: 1 | -1 };

/**
 * The orders list (FR-ORD-001): filters by status, payment, balance, channel, region, branch, agent, source and date,
 * sortable columns, a column chooser, saved views, bulk selection and export (FR-DB-002).
 */
export function OrdersTable({ mode, initial, initialQuery = "", initialBranch = "all", canExport = false }: { mode: "db" | "demo"; initial: DashOrder[]; initialQuery?: string; initialBranch?: string; canExport?: boolean }) {
  const { orders } = useOrdersApi(mode, initial);
  const [f, setF] = useState<Record<string, string>>({
    q: initialQuery, status: "all", pay: "all", channel: "all", branch: initialBranch === "accra" ? "Accra" : initialBranch === "kumasi" ? "Kumasi" : "all",
    region: "all", agent: "all", source: "all", from: "", to: "",
  });
  const [sort, setSort] = useState<Sort>({ col: "Placed", dir: -1 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const { cols, toggle } = useColumns("orders", ALL, DEFAULT);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const opts = useMemo(() => ({
    regions: [...new Set(orders.map((o) => o.region).filter(Boolean))].sort() as string[],
    agents: [...new Set(orders.map((o) => o.agent).filter(Boolean))].sort(),
    sources: [...new Set(orders.map((o) => o.source).filter(Boolean))].sort() as string[],
  }), [orders]);

  const list = orders.filter((o) =>
    (f.status === "all" || o.status === f.status) &&
    (f.pay === "all" || (f.pay === "balance" ? o.balance > 0 && o.pay === "half" : f.pay === "pending" ? o.pay === "pending" : f.pay === "unpaid" ? o.pay === "unpaid" : o.pay === "paid" && o.balance === 0)) &&
    (f.channel === "all" || o.channel === f.channel) &&
    (f.branch === "all" || o.branch === f.branch) &&
    (f.region === "all" || o.region === f.region) &&
    (f.agent === "all" || o.agent === f.agent) &&
    (f.source === "all" || o.source === f.source) &&
    (!f.from || (o.createdAt ?? "") >= f.from) && (!f.to || (o.createdAt ?? "").slice(0, 10) <= f.to) &&
    (!f.q || `${o.id} ${o.customer} ${o.phone ?? ""} ${o.place} ${o.items}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  const key = (o: DashOrder): string | number => {
    switch (sort.col) {
      case "Order": return o.id;
      case "Customer": return o.customer;
      case "Total": return o.total;
      case "Status": return stages.findIndex((s) => s.id === o.status);
      case "Agent": return o.agent;
      case "Region": return o.region ?? "";
      default: return o.createdAt ?? "";
    }
  };
  const sorted = [...list].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sort.dir);
  const active = Object.entries(f).some(([k, v]) => (k === "q" || k === "from" || k === "to" ? !!v : v !== "all"));
  const sel = "min-h-9 rounded-[10px] border border-line bg-white px-2 text-sm";

  const cell = (o: DashOrder, c: string): React.ReactNode => {
    switch (c) {
      case "Order": return <Link href={`/dashboard/orders/${o.id}`} className="font-semibold text-navy hover:underline">{o.id}{o.late && <span className="ml-1 text-error" title="Waiting longer than it should">●</span>}</Link>;
      case "Placed": return o.createdAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(o.createdAt)) : "";
      case "Customer": return `${o.customer} · ${o.place}`;
      case "Items": return o.items;
      case "Channel": return o.channel;
      case "Region": return o.region ?? "Pickup";
      case "Source": return o.source ?? "";
      case "Payment": return payPill(o);
      case "Total": return `GHS ${o.total.toLocaleString("en-GH")}`;
      case "Status": return <Pill tone={o.status === "delivered" ? "ok" : o.status === "failed" ? "bad" : "info"}>{stageTitle(o.status)}</Pill>;
      case "Agent": return o.agent;
      case "Rider": return o.rider ?? o.courier ?? "";
      case "Age": return o.age;
      default: return "";
    }
  };
  const plain = (o: DashOrder, c: string) => (c === "Payment" ? o.payNote : c === "Status" ? stageTitle(o.status) : c === "Total" ? o.total : c === "Order" ? o.id : String(cell(o, c) ?? ""));
  const shown = ALL.filter((c) => cols.includes(c));
  const allPicked = sorted.length > 0 && sorted.every((o) => picked.has(o.id));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search order, customer, phone, item" aria-label="Search orders" className="field !min-h-9 max-w-xs flex-1" />
        <select value={f.status} onChange={(e) => set("status", e.target.value)} className={sel} aria-label="Status"><option value="all">All statuses</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        <select value={f.pay} onChange={(e) => set("pay", e.target.value)} className={sel} aria-label="Payment"><option value="all">Any payment</option><option value="paid">Paid in full</option><option value="balance">Balance due</option><option value="pending">Pending check</option><option value="unpaid">Unpaid</option></select>
        <select value={f.channel} onChange={(e) => set("channel", e.target.value)} className={sel} aria-label="Channel"><option value="all">All channels</option>{["Web", "WhatsApp", "Instagram DM", "Phone", "Walk-in"].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.branch} onChange={(e) => set("branch", e.target.value)} className={sel} aria-label="Branch"><option value="all">Both branches</option><option>Accra</option><option>Kumasi</option></select>
        <select value={f.region} onChange={(e) => set("region", e.target.value)} className={sel} aria-label="Region"><option value="all">All regions</option>{opts.regions.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={f.agent} onChange={(e) => set("agent", e.target.value)} className={sel} aria-label="Agent"><option value="all">All agents</option>{opts.agents.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={f.source} onChange={(e) => set("source", e.target.value)} className={sel} aria-label="How they found us"><option value="all">Any source</option>{opts.sources.map((r) => <option key={r}>{r}</option>)}</select>
        <label className="flex items-center gap-1 text-sm">From <input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className={sel} /></label>
        <label className="flex items-center gap-1 text-sm">To <input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className={sel} /></label>
        {active ? <button type="button" className="text-sm text-text2 underline" onClick={() => setF({ q: "", status: "all", pay: "all", channel: "all", branch: "all", region: "all", agent: "all", source: "all", from: "", to: "" })}>Clear</button> : null}
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text2" aria-live="polite">{sorted.length} {sorted.length === 1 ? "order" : "orders"}{picked.size ? ` · ${picked.size} selected` : ""}</p>
          {mode === "db" && <SavedViews list="orders" current={f} onApply={(p) => setF((x) => ({ ...x, ...p }))} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {picked.size > 0 && (
            <>
              <button type="button" className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => downloadCsv("drezzy-orders-selected.csv", shown, sorted.filter((o) => picked.has(o.id)).map((o) => shown.map((c) => plain(o, c))))}>Export selected (CSV)</button>
              <button type="button" className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => { void navigator.clipboard.writeText(sorted.filter((o) => picked.has(o.id)).map((o) => o.id).join(", ")); setMsg("Order numbers copied."); }}>Copy numbers</button>
              <button type="button" className="text-sm text-text2 underline" onClick={() => setPicked(new Set())}>Clear selection</button>
            </>
          )}
          {canExport && mode === "db" && (
            <select className={sel} aria-label="Export all filtered orders" value="" onChange={async (e) => {
              const fmt = e.target.value;
              if (!fmt) return;
              setMsg("Preparing your export…");
              const err = await serverExport("orders", fmt, { status: f.status === "all" ? "" : f.status === "out" ? "out_for_delivery" : f.status === "failed" ? "failed_delivery" : f.status, region: f.region === "all" ? "" : f.region, from: f.from, to: f.to, q: f.q });
              setMsg(err ?? "Export ready. The link works for 24 hours.");
            }}>
              <option value="">Export…</option><option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option><option value="json">JSON</option>
            </select>
          )}
          <ColumnChooser all={ALL} cols={cols} toggle={toggle} />
        </div>
      </div>
      {msg && <p role="status" className="mb-2 text-sm text-text2">{msg}</p>}
      {sorted.length === 0 ? (
        <p className="card p-10 text-center text-text2">No orders match those filters.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-text2">
              <tr>
                <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(sorted.map((o) => o.id)))} className="accent-[#00115b]" /></th>
                {shown.map((c) => (
                  <th key={c} className="px-4 py-3 font-medium" aria-sort={sort.col === c ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                    <button type="button" className="hover:text-navy" onClick={() => setSort((s) => ({ col: c, dir: s.col === c ? ((-s.dir) as 1 | -1) : 1 }))}>{c}{sort.col === c ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => (
                <tr key={o.id} className={`border-b border-line last:border-0 ${picked.has(o.id) ? "bg-[#eef1fb]" : ""}`}>
                  <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${o.id}`} checked={picked.has(o.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} className="accent-[#00115b]" /></td>
                  {shown.map((c) => <td key={c} className="px-4 py-3">{cell(o, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
