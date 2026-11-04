import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/dashboard/Guard";
import { OrderDetailLive } from "@/components/dashboard/OrderDetailLive";
import { OrderDetailView } from "@/components/dashboard/OrderDetailView";
import { OrderExtras } from "@/components/dashboard/OrderExtras";
import { getOrderExtras } from "@/lib/orders/extras";
import { getOrderDetail } from "@/lib/orders/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function generateStaticParams() {
  return ["DRZ-1027", "DRZ-1029", "DRZ-1031", "DRZ-1035", "DRZ-1036"].map((id) => ({ id }));
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured) return <OrderDetailView id={id} />;
  const [d, extras] = await Promise.all([getOrderDetail(decodeURIComponent(id)), getOrderExtras(decodeURIComponent(id))]);
  if (!d) {
    return (
      <div className="card mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-semibold">Order not found</p>
        <p className="mt-1 text-sm text-text2">{id} does not exist, or you do not have access to it.</p>
        <Link href="/dashboard/orders" className="btn-primary mt-4">Back to orders</Link>
      </div>
    );
  }
  return (
    <>
      <OrderDetailLive d={d} />
      {extras && <OrderExtras d={extras} />}
    </>
  );
}

export default function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Guard module="orders">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
        <Detail params={params} />
      </Suspense>
    </Guard>
  );
}
