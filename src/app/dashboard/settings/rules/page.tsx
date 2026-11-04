import { Suspense } from "react";
import { Guard } from "@/components/dashboard/Guard";
import { RulesForm } from "@/components/dashboard/SettingsForms";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Rules and alerts" };

async function Form() {
  const me = await requireStaff();
  const { data } = await (await createClient()).from("app_settings").select("key, value");
  const s = Object.fromEntries(((data ?? []) as { key: string; value: Record<string, unknown> }[]).map((r) => [r.key, r.value]));
  return <RulesForm initial={s} canEdit={can(me.permissions, "settings", "edit")} isOwner={me.roleKey === "owner"} />;
}

export default function Page() {
  return <Guard module="settings"><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Form /></Suspense></Guard>;
}
