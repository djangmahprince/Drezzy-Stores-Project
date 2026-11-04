import { Suspense } from "react";
import { Guard } from "@/components/dashboard/Guard";
import { SiteSettingsForm } from "@/components/dashboard/SettingsForms";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Site settings" };

async function Form() {
  const me = await requireStaff();
  const { data } = await (await createClient()).from("site_settings").select("data").maybeSingle();
  return <SiteSettingsForm initial={(data?.data as Record<string, unknown>) ?? {}} canEdit={can(me.permissions, "settings", "edit") || can(me.permissions, "content", "edit")} />;
}

export default function Page() {
  return <Guard module={["settings", "content"]}><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Form /></Suspense></Guard>;
}
