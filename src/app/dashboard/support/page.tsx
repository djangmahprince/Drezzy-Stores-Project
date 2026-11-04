import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { SupportInbox } from "@/components/dashboard/SupportInbox";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Support inbox" };

/** The support inbox (FR-DB-009): customers write from their account or the tracking page; staff reply here. */
async function Inbox({ searchParams }: { searchParams: Promise<{ thread?: string; status?: string }> }) {
  const { thread, status = "open" } = await searchParams;
  let q = (await createClient()).from("support_threads").select("id, subject, status, complaint, last_message_at, first_reply_at, created_at, order:orders(id, number), customer:customers(id, full_name, phone), messages:support_messages(id, from_staff, author_name, body, at)").order("last_message_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return <SupportInbox threads={(data ?? []) as unknown as Parameters<typeof SupportInbox>[0]["threads"]} selected={thread ?? null} status={status} />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ thread?: string; status?: string }> }) {
  return (
    <Guard module="customers">
      <PageHead real title="Support inbox" sub="Customer messages from their account and the tracking page, linked to their orders" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Inbox searchParams={searchParams} /></Suspense>
    </Guard>
  );
}
