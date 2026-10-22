import { Suspense } from "react";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { getCustomers } from "@/lib/customers/staff";
import { formatGHS } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Customers" };

const phone = (p: string) => p.replace(/^\+233(\d{2})(\d{3})(\d{4})$/, "+233 $1 $2 $3");
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(iso)) : "–");

async function Live({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const d = await getCustomers(q ?? "");
  const head = d.deliveryOnly ? ["Name", "Phone", "Last delivery region", "Orders"] : ["Name", "Phone", "Email", "Source", "Orders", "Paid in total", "Last order"];
  return (
    <>
      <form className="mb-3 flex gap-2" role="search">
        <input name="q" defaultValue={d.q} aria-label="Search customers" placeholder="Search by name, phone or email" className="field !min-h-10 max-w-sm" />
        <button className="btn-outline !min-h-10">Search</button>
      </form>
      {d.rows.length === 0 ? <p className="card p-8 text-center text-sm text-text2">{d.q ? "No customers match that search." : "No customers yet. They appear here when someone orders."}</p> : (
        <Table head={head} rows={d.rows.map((c) => d.deliveryOnly
          ? [c.name, phone(c.phone), c.region ?? "–", String(c.orders)]
          : [c.name, phone(c.phone), c.email ?? "–", c.source ?? "–", <span key={c.id}>{c.orders} {c.orders > 1 && <Pill tone="info">Repeat</Pill>}</span>, formatGHS(c.spent), day(c.last)])} />
      )}
      {d.truncated && <p className="mt-2 text-xs text-text2">Showing the newest 200. Search to narrow it down.</p>}
    </>
  );
}

function Sample() {
  return (
    <>
      <PageHead title="Customers" sub="Sample customers. Connect Supabase to see your own." />
      <Table head={["Name", "Phone", "Region", "Source", "Orders", "Lifetime value"]} rows={[
        ["Ama Mensah", "+233 24 000 0000", "Ashanti", "Instagram", "3", "GHS 1,250"],
        ["Esi Boateng", "+233 20 000 0001", "Greater Accra", "TikTok", "1", "GHS 400"],
      ]} />
    </>
  );
}

export default function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Guard module="customers">
      {isSupabaseConfigured ? (
        <>
          <PageHead real title="Customers" sub="One record per customer, whatever channel they used" />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
            <Live searchParams={searchParams} />
          </Suspense>
        </>
      ) : (
        <Sample />
      )}
    </Guard>
  );
}
