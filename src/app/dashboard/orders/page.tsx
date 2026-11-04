import Link from "next/link";
import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { OrdersTable } from "@/components/dashboard/OrdersTable";
import { getStaffOrders } from "@/lib/orders/staff";
import { requireStaff } from "@/lib/auth";
import { currentBranch } from "@/lib/branch";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Orders" };

async function List({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [{ mode, orders, rights }, branch, me] = await Promise.all([getStaffOrders(), currentBranch(), requireStaff()]);
  return (
    <>
      {rights.canCreate && <p className="-mt-3 mb-4"><Link href="/dashboard/orders/new" className="btn-primary !min-h-10">Create order</Link></p>}
      <OrdersTable key={`${q ?? ""}${branch}`} mode={mode} initial={orders} initialQuery={q ?? ""} initialBranch={branch} canExport={can(me.permissions, "exports", "export")} />
    </>
  );
}

export default function Orders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Guard module="orders">
      <PageHead real={isSupabaseConfigured} title="Orders" sub="Every order from every channel" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </Guard>
  );
}
