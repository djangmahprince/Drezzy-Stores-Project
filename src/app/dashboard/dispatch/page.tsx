import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DispatchBoard } from "@/components/dashboard/DispatchBoard";
import { Guard } from "@/components/dashboard/Guard";
import { getStaffOrders } from "@/lib/orders/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Dispatch board" };

async function Board() {
  const { mode, orders } = await getStaffOrders();
  return <DispatchBoard mode={mode} initial={orders} />;
}

export default function Dispatch() {
  return (
    <Guard module="orders">
      <PageHead real={isSupabaseConfigured} title="Dispatch board" sub="Drag a card to move it to the next stage. Each move updates the customer's tracker." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <Board />
      </Suspense>
    </Guard>
  );
}
