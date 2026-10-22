import { Suspense } from "react";
import { ShopBrowser } from "@/components/store/ShopBrowser";

export const metadata = { title: "Shop" };

async function Listing({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const { category, q } = await searchParams;
  const initial = category ?? "All"; // the browser falls back to All when the category does not exist
  return <ShopBrowser key={`${initial}|${q ?? ""}`} initialCategory={initial} initialQuery={q ?? ""} />;
}

export default function Shop({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true">
          <div className="h-10 w-48 animate-pulse rounded-[12px] bg-white" />
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-[24px] bg-white" />)}
          </div>
        </div>
      }
    >
      <Listing searchParams={searchParams} />
    </Suspense>
  );
}
