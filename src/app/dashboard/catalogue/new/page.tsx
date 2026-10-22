import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { ProductForm } from "@/components/dashboard/ProductForm";
import { getCategoryOptions } from "@/lib/catalogue/staff";

export const metadata = { title: "Add product" };

async function Form() {
  return <ProductForm categories={await getCategoryOptions()} />;
}

export default function NewProduct() {
  return (
    <Guard module="products" action="create">
      <PageHead real title="Add product" sub="Create the product and all its sizes in one go" />
      <DbGate>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Form />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
