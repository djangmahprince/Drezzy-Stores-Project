import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { ProductEditor } from "@/components/dashboard/ProductEditor";
import { getCategoryOptions, getProductForEdit } from "@/lib/catalogue/staff";

export const metadata = { title: "Edit product" };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, categories] = await Promise.all([getProductForEdit(id), getCategoryOptions()]);
  if (!p) notFound();
  return (
    <>
      <PageHead real title={p.name} sub={`SKU ${p.sku}. Prices, sizes and availability are on the catalogue screen.`} />
      <ProductEditor p={p} categories={categories} />
    </>
  );
}

export default function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Guard module="products" action="edit">
      <DbGate>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Editor params={params} />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
