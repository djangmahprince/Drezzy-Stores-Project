import { Suspense } from "react";
import { CrudEditor } from "@/components/dashboard/CrudEditor";
import { Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Redirects" };

async function Redirects() {
  const me = await requireStaff();
  return <CrudEditor name="redirects" canEdit={can(me.permissions, "settings", "edit") || can(me.permissions, "content", "edit")} intro="Send old links to new pages, so links shared on Instagram and WhatsApp keep working (FR-CMS-010). Changes apply within a minute." />;
}

export default function Page() {
  return <Guard module={["settings", "content"]}><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Redirects /></Suspense></Guard>;
}
