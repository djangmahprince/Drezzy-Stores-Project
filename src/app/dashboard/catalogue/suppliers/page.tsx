import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { SupplierManager } from "@/components/dashboard/SupplierManager";
import { requireStaff } from "@/lib/auth";
import { getSuppliers } from "@/lib/catalogue/staff";
import { can } from "@/lib/permissions";

export const metadata = { title: "Suppliers" };

async function List() {
  const me = await requireStaff();
  const suppliers = await getSuppliers();
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
