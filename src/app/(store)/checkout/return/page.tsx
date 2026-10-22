import { Suspense } from "react";
import { CheckoutReturn } from "@/components/store/CheckoutReturn";

export const metadata = { title: "Payment" };

async function Return({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return <CheckoutReturn order={order ?? ""} />;
}

export default function ReturnPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-xl animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
      <Return searchParams={searchParams} />
    </Suspense>
  );
}
