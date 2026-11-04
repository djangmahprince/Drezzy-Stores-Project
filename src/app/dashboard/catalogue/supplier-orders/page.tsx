import Link from "next/link";
import { Suspense } from "react";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { getSupplierOrders } from "@/lib/catalogue/staff";

export const metadata = { title: "Supplier orders" };

const word = { ordered: "Ordered", received: "Received", failed: "Failed" } as const;
const tone = { ordered: "info", received: "ok", failed: "bad" } as const;
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(new Date(iso));

async function List() {
  const rows = await getSupplierOrders(500);
  if (rows.length === 0) return <p className="card p-8 text-center text-sm text-text2">No supplier orders yet. They start from an order that has been paid.</p>;
  return <Table head={["Status", "Order", "Supplier", "What", "Date"]} rows={rows.map((r) => [
    <Pill key={r.id} tone={tone[r.status]}>{word[r.status]}</Pill>, <Link key={`${r.id}o`} href={`/dashboard/orders/${r.orderNumber}`} className="font-semibold text-navy underline">{r.orderNumber}</Link>, r.supplier, r.text, stamp(r.at),
  ])} />;
}

export default function SupplierOrders() {
  return (
    <Guard module="availability">
      <PageHead real title="Supplier orders" sub="Everything ordered from suppliers, newest first" />
      <DbGate>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}><List /></Suspense>
      </DbGate>
    </Guard>
  );
}
