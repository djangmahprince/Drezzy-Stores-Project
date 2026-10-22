import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { SupplierManager } from "@/components/dashboard/SupplierManager";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Suppliers" };

async function List() {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name, phone, whatsapp, notes, active").order("name");
  const suppliers = (data ?? []).map((s: { id: string; name: string; phone: string | null; whatsapp: string | null; notes: string | null; active: boolean }) => ({
    id: s.id, name: s.name, phone: s.phone ?? undefined, whatsapp: s.whatsapp ?? undefined, notes: s.notes ?? undefined, active: s.active,
  }));
  return <SupplierManager suppliers={suppliers} canEdit={can(me.permissions, "availability", "edit")} />;
}

export default function SuppliersPage() {
  return (
    <Guard module="availability">
      <PageHead real title="Suppliers" sub="The trusted suppliers and wholesalers you source from" />
      <DbGate>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <List />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
