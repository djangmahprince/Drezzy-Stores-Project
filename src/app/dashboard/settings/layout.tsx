import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { SettingsTabs } from "@/components/dashboard/SettingsTabs";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";

async function Tabs() {
  const { permissions: p } = await requireStaff();
  const tabs = [
    can(p, "settings") && { href: "/dashboard/settings", label: "Delivery zones" },
    (can(p, "settings") || can(p, "content")) && { href: "/dashboard/settings/site", label: "Site details" },
    can(p, "settings") && { href: "/dashboard/settings/rules", label: "Rules and alerts" },
    can(p, "orders") && { href: "/dashboard/settings/riders", label: "Riders" },
    can(p, "settings") && { href: "/dashboard/settings/templates", label: "Email templates" },
    can(p, "settings") && { href: "/dashboard/settings/messages", label: "Message log" },
    (can(p, "settings") || can(p, "content")) && { href: "/dashboard/settings/redirects", label: "Redirects" },
    can(p, "settings") && { href: "/dashboard/settings/integrations", label: "Integrations and data" },
    can(p, "staff") && { href: "/dashboard/settings/staff", label: "Staff" },
    can(p, "staff") && { href: "/dashboard/settings/roles", label: "Roles" },
    can(p, "audit") && { href: "/dashboard/settings/audit", label: "Audit log" },
  ].filter((t): t is { href: string; label: string } => !!t);
  return <SettingsTabs tabs={tabs} />;
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHead real title="Settings" sub="Delivery, site details, rules and alerts, riders, templates, staff, roles and the audit log" />
      <Suspense fallback={<div className="mb-5 h-10" aria-hidden="true" />}>
        <Tabs />
      </Suspense>
      {children}
    </>
  );
}
