import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { ExportCenter, type ExportJob } from "@/components/dashboard/ExportCenter";
import { requireStaff } from "@/lib/auth";
import { exportKinds } from "@/lib/export/kinds";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Exports" };

async function Center() {
  const me = await requireStaff();
  const catalogueOnly = /^catalogue/i.test(me.permissions.exports?.restriction ?? "");
  const { data } = await (await createClient()).from("export_jobs").select("id, kind, format, status, row_count, created_at, expires_at, error").eq("staff_id", me.id).order("created_at", { ascending: false }).limit(20);
  return <ExportCenter kinds={catalogueOnly ? ["catalogue", "suppliers"] : [...exportKinds]} canJson={can(me.permissions, "settings", "edit")} jobs={(data ?? []) as ExportJob[]} />;
}

export default function Exports() {
  return (
    <Guard module="exports" action="export">
      <PageHead real title="Exports" sub="Your data as CSV, Excel, PDF or JSON. You only get what your role may already see, every export is logged, and links stop working after 24 hours." />
      <DbGate>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Center />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
