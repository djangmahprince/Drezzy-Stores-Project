import { Suspense } from "react";
import { CatalogueManager } from "@/components/dashboard/CatalogueManager";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { getStaffCatalogue } from "@/lib/catalogue/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Catalogue and sourcing" };

async function Manager() {
  return <CatalogueManager data={await getStaffCatalogue()} />;
}

export default function Catalogue() {
  return (
    <Guard module={["products", "availability"]}>
      <PageHead real={isSupabaseConfigured} title="Catalogue and sourcing" sub="What our suppliers can provide, at what cost and how fast. Changes show on the storefront within seconds." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <Manager />
      </Suspense>
    </Guard>
  );
}
