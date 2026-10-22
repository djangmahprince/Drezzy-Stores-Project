import { Suspense } from "react";
import { CreateOrderForm } from "@/components/dashboard/CreateOrderForm";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { getSellableProducts } from "@/lib/catalogue/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Create order" };

async function Form() {
  return <CreateOrderForm products={await getSellableProducts()} live={isSupabaseConfigured} />;
}

export default function NewOrder() {
  return (
    <Guard module="orders" action="create">
      <PageHead real={isSupabaseConfigured} title="Create order" sub="Capture a WhatsApp, phone or walk-in sale" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <Form />
      </Suspense>
    </Guard>
  );
}
