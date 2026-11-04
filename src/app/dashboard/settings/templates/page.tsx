import { Suspense } from "react";
import { CrudEditor } from "@/components/dashboard/CrudEditor";
import { Guard } from "@/components/dashboard/Guard";
import { TestSend } from "@/components/dashboard/SettingsForms";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Email templates" };

async function Templates() {
  const me = await requireStaff();
  const { data } = await (await createClient()).from("message_templates").select("key, subject, body").order("key");
  return (
    <div className="space-y-4">
      <CrudEditor name="message_templates" canEdit={can(me.permissions, "settings", "edit")} intro="The wording of every email (FR-NT-001). Variables in double braces are filled in for each customer. The same text, shortened, is used for SMS and WhatsApp." />
      {can(me.permissions, "settings", "edit") && <TestSend templates={(data ?? []) as { key: string; subject: string; body: string }[]} />}
    </div>
  );
}

export default function Page() {
  return <Guard module="settings"><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Templates /></Suspense></Guard>;
}
