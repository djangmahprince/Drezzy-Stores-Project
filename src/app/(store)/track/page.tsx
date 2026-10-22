import { Suspense } from "react";
import { TrackView } from "@/components/store/TrackView";

export const metadata = { title: "Track an order" };

async function Lookup({ searchParams }: { searchParams: Promise<{ order?: string; phone?: string }> }) {
  const { order, phone } = await searchParams;
  return <TrackView key={`${order ?? ""}|${phone ?? ""}`} initialOrder={order ?? ""} initialPhone={phone ?? ""} />;
}

export default function Track({ searchParams }: { searchParams: Promise<{ order?: string; phone?: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto h-48 max-w-3xl animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
      <Lookup searchParams={searchParams} />
    </Suspense>
  );
}
