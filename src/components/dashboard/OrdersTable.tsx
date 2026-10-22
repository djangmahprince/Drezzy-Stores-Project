"use client";

import Link from "next/link";
import { useState } from "react";
import { Pill, Table } from "@/components/dashboard/DashShell";
import { stages, stageTitle, type DashOrder } from "@/lib/orders/dash-types";
import { useOrdersApi } from "@/lib/orders/api";

const payPill = (o: DashOrder) =>
  o.pay === "pending" ? <Pill tone="warn">Pending check</Pill>
  : o.pay === "unpaid" ? <Pill tone="info">Unpaid</Pill>
  : o.balance > 0 ? <Pill tone="warn">Part paid · GHS {o.balance} due</Pill>
  : <Pill tone="ok">Paid</Pill>;

export function OrdersTable({ mode, initial, initialQuery = "" }: { mode: "db" | "demo"; initial: DashOrder[]; initialQuery?: string }) {
  const { orders } = useOrdersApi(mode, initial);
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState("all");
  const [channel, setChannel] = useState("all");
  const [branch, setBranch] = useState("all");

  const list = orders.filter((o) =>
    (status === "all" || o.status === status) &&
    (pay === "all" || (pay === "balance" ? o.balance > 0 && o.pay === "half" : pay === "pending" ? o.pay === "pending" : pay === "unpaid" ? o.pay === "unpaid" : o.pay === "paid" && o.balance === 0)) &&
    (channel === "all" || o.channel === channel) &&
    (branch === "all" || o.branch === branch) &&
    (!q || `${o.id} ${o.customer} ${o.place} ${o.items}`.toLowerCase().includes(q.toLowerCase())),
  );
  const active = [status, pay, channel, branch].some((v) => v !== "all") || q;
  const sel = "min-h-9 rounded-[10px] border border-line bg-white px-2 text-sm";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order, customer, item" aria-label="Search orders" className="field !min-h-9 max-w-xs flex-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status"><option value="all">All statuses</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        <select value={pay} onChange={(e) => setPay(e.target.value)} className={sel} aria-label="Payment"><option value="all">Any payment</option><option value="paid">Paid in full</option><option value="balance">Balance due</option><option value="pending">Pending check</option><option value="unpaid">Unpaid</option></select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={sel} aria-label="Channel"><option value="all">All channels</option>{["Web", "WhatsApp", "Instagram DM", "Phone", "Walk-in"].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={sel} aria-label="Branch"><option value="all">Both branches</option><option>Accra</option><option>Kumasi</option></select>
        {active ? <button type="button" className="text-sm text-text2 underline" onClick={() => { setQ(""); setStatus("all"); setPay("all"); setChannel("all"); setBranch("all"); }}>Clear</button> : null}
      </div>
      <p className="mb-2 text-sm text-text2" aria-live="polite">{list.length} {list.length === 1 ? "order" : "orders"}</p>
      {list.length === 0 ? (
        <p className="card p-10 text-center text-text2">No orders match those filters.</p>
      ) : (
        <Table
          head={["Order", "Customer", "Items", "Channel", "Payment", "Status", "Agent"]}
          rows={list.map((o) => [
            <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="font-semibold text-navy hover:underline">{o.id}</Link>,
            `${o.customer} · ${o.place}`,
            o.items,
            o.channel,
            payPill(o),
            <Pill key="s" tone={o.status === "delivered" ? "ok" : o.status === "failed" ? "bad" : "info"}>{stageTitle(o.status)}</Pill>,
            o.agent,
          ])}
        />
      )}
    </>
  );
}
