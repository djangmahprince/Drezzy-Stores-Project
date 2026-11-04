import Link from "next/link";
import { Suspense } from "react";
import { CustomerDirectory } from "@/components/dashboard/CustomerDirectory";
import { PageHead, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { zones } from "@/lib/data";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Customers" };

async function Live() {
  const me = await requireStaff();
  const full = can(me.permissions, "customers", "edit") && me.permissions.customers?.scope === "all";
  return (
    <>
      {full && (
        <div className="-mt-3 mb-4 flex flex-wrap gap-2">
          <Link href="/dashboard/customers/import" className="btn-outline !min-h-10">Import from CSV</Link>
          <Link href="/dashboard/customers/requests" className="btn-outline !min-h-10">Data requests</Link>
          <Link href="/dashboard/support" className="btn-outline !min-h-10">Support inbox</Link>
        </div>
      )}
      <CustomerDirectory canExport={can(me.permissions, "exports", "export")} canMerge={full} regions={zones.map((z) => z.region)} />
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

export default function Customers() {
  return (
    <Guard module="customers">
      {isSupabaseConfigured ? (
        <>
          <PageHead real title="Customers" sub="One record per customer, whatever channel they used. Tick two to merge duplicates." />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
            <Live />
          </Suspense>
        </>
      ) : (
        <Sample />
      )}
    </Guard>
  );
}
