import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/dashboard/DashShell";
import { DispatchBoard, type Rider } from "@/components/dashboard/DispatchBoard";
import { Guard } from "@/components/dashboard/Guard";
import { getStaffOrders } from "@/lib/orders/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dispatch board" };

async function Board() {
  const { mode, orders } = await getStaffOrders();
  const { data } = mode === "db" ? await (await createClient()).from("riders").select("id, name, kind, company").eq("active", true).order("name") : { data: [] };
  return <DispatchBoard mode={mode} initial={orders} riders={(data ?? []) as Rider[]} />;
}

export default function Dispatch() {
  return (
    <Guard module="orders">
      <PageHead real={isSupabaseConfigured} title="Dispatch board" sub="Drag a card to move it to the next stage. Each move updates the customer's tracker. Amber chips mark a half-paid Accra order with a balance to collect." />
      <Link href="/dashboard/orders/new" className="btn-primary mb-4 !min-h-11"><Icon name="plus" size={18} /> Create order</Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <Board />
      </Suspense>
    </Guard>
  );
}
