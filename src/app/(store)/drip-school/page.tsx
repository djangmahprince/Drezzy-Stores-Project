import { Suspense } from "react";
import { DripBrowser } from "@/components/store/DripBrowser";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { getArticles } from "@/lib/articles/server";

export const metadata = { title: "Drip School", description: "Outfit guides, trends from Accra and Kumasi, sneaker care and sizing help from Drezzy Stores." };

async function Browser({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const [{ tag }, articles] = await Promise.all([searchParams, getArticles()]);
  return <DripBrowser articles={articles} initialTag={tag ?? ""} />;
}

export default function DripSchool({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  return (
    <div>
      <p className="label-wide text-text2">Drip School</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Learn how to dress. Find what to wear.</h1>
      <Suspense fallback={<div className="mt-6 h-72 animate-pulse rounded-[12px] bg-white" />}><Browser searchParams={searchParams} /></Suspense>
      <NewsletterForm placement="drip-school" />
    </div>
  );
}
