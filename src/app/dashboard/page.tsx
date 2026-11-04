import { Suspense } from "react";
import { HomeLive } from "@/components/dashboard/HomeLive";
import { OwnerHome } from "@/components/dashboard/OwnerHome";
import { requireStaff } from "@/lib/auth";
import { getHome } from "@/lib/dashboard/home";
import { getOwnerView } from "@/lib/dashboard/owner-home";
import { ownerSample } from "@/lib/dashboard/owner-sample";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Dashboard" };

async function Live() {
  const me = await requireStaff();
  // the Owner and Admins get the business overview; every other role gets the first screen for their job
  if (me.roleKey === "owner" || me.roleKey === "admin") return <OwnerHome real v={await getOwnerView(me)} />;
  return <HomeLive d={await getHome()} />;
}

export default function DashboardHome() {
  // with Supabase connected the home screen shows real counts; the sample is only for the design preview
  return isSupabaseConfigured ? (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
      <Live />
    </Suspense>
  ) : (
    <OwnerHome real={false} v={ownerSample} />
  );
}
