import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { ZoneEditor } from "@/components/dashboard/ZoneEditor";
import { requireStaff } from "@/lib/auth";
import { zones } from "@/lib/data";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

// People who cannot see delivery zones are sent to the first settings tab their role does have.
async function Landing() {
  const { permissions: p } = await requireStaff();
  if (!can(p, "settings")) {
    if (can(p, "staff")) redirect("/dashboard/settings/staff");
    if (can(p, "audit")) redirect("/dashboard/settings/audit");
  }
  return null;
}

async function Zones() {
  const me = await requireStaff();
  if (!isSupabaseConfigured) {
    return (
      <>
        <p className="mb-3 text-sm text-text2">These are the default starting values. Connect Supabase to edit them.</p>
        <Table head={["Region", "Fee", "Estimated days", "Half payment"]} rows={zones.map((z) => [z.region, `GHS ${z.fee}`, `${z.days}`, z.accra ? "Allowed" : "Not allowed"])} />
      </>
    );
  }
  const { data } = await (await createClient()).from("delivery_zones").select("region, fee, est_days, half_payment_allowed, active").order("sort");
  const rows = (data ?? []).map((z) => ({ region: z.region as string, fee: Number(z.fee), days: z.est_days as number, half: z.half_payment_allowed as boolean, active: z.active as boolean }));
  return <ZoneEditor initial={rows} canEdit={can(me.permissions, "settings", "edit")} />;
}

export default function Settings() {
  return (
    <>
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
      <Guard module="settings">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Zones />
        </Suspense>
      </Guard>
    </>
  );
}
