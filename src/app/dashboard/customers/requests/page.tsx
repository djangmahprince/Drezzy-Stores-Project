import { Suspense } from "react";
import { DataRequests } from "@/components/dashboard/DataRequests";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { today } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Data requests" };

/** Data rights requests (FR-ACC-011, Data Protection Act): logged, answered within 30 days. */
async function List() {
  const { data } = await (await createClient()).from("data_requests").select("id, kind, details, email, phone, status, due_at, created_at, response, handled_by_name, user_id").order("created_at", { ascending: false }).limit(200);
  const { date } = await today();
  const rows = ((data ?? []) as Parameters<typeof DataRequests>[0]["rows"]).map((r) => ({ ...r, overdue: r.status === "open" && r.due_at.slice(0, 10) < date }));
  return <DataRequests rows={rows} />;
}

export default function Page() {
  return (
    <Guard module="customers" action="edit">
      <PageHead real title="Data requests" sub="Access, correction, deletion and consent requests. Answer within 30 days." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><List /></Suspense>
    </Guard>
  );
}
