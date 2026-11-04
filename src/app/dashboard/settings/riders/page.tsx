import { Suspense } from "react";
import { CrudEditor } from "@/components/dashboard/CrudEditor";
import { Guard } from "@/components/dashboard/Guard";
import { PartnerLogin } from "@/components/dashboard/SettingsForms";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Riders and couriers" };

async function Riders() {
  const me = await requireStaff();
  const full = can(me.permissions, "orders", "edit") && me.permissions.orders?.scope === "all";
  const { data } = await (await createClient()).from("riders").select("id, name, user_id").eq("active", true).order("name");
  return (
    <div className="space-y-5">
      <CrudEditor name="riders" canEdit={full} intro="Our riders and the courier agents we use (FR-ORD-006). Any courier can be recorded; dispatch picks one on each order." />
      {full && <PartnerLogin riders={((data ?? []) as { id: string; name: string; user_id: string | null }[]).map((r) => ({ id: r.id, name: r.name, hasLogin: !!r.user_id }))} />}
    </div>
  );
}

export default function Page() {
  return <Guard module="orders"><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Riders /></Suspense></Guard>;
}
