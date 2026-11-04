import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { ProductsTable } from "@/components/dashboard/ProductsTable";
import { getStaffCatalogue } from "@/lib/catalogue/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Products" };

async function Table() {
  return <ProductsTable data={await getStaffCatalogue()} />;
}

export default function Products() {
  return (
    <Guard module="products">
      <PageHead real={isSupabaseConfigured} title="Products" sub="Every product in one table. Select several to change them together." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}><Table /></Suspense>
    </Guard>
  );
}
