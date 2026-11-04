import type { Metadata } from "next";
import { Suspense } from "react";
import { DashSidebar, DashTopbar } from "@/components/dashboard/DashShell";
import { requireStaff } from "@/lib/auth";
import { currentBranch } from "@/lib/branch";
import { navFor } from "@/lib/permissions";

export const metadata: Metadata = { title: { default: "Staff dashboard", template: "%s | Drezzy Staff" } };

// Reading the session happens at request time, so it sits behind Suspense and streams in (Cache Components).
async function Frame({ children }: { children: React.ReactNode }) {
  const [staff, branch] = await Promise.all([requireStaff(), currentBranch()]);
  const items = navFor(staff.permissions).map(({ href, label }) => ({ href, label }));
  const who = { name: staff.fullName, role: staff.roleName };
  const pick = staff.branch === "both" ? branch : undefined; // people tied to one branch have nothing to switch
  return (
    <div className="dash-shell flex min-h-screen bg-page">
      <DashSidebar items={items} who={who} branch={pick} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashTopbar items={items} who={who} branch={pick} />
        <main className="min-w-0 flex-1 px-4 pb-6 pt-2 md:px-6">
          {/* page content streams in here, so moving between dashboard pages keeps the sidebar and top bar in place */}
          <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="h-9 w-56 animate-pulse rounded-[12px] bg-white" /><div className="h-64 animate-pulse rounded-[12px] bg-white" /></div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-screen bg-page" aria-busy="true">
      <div className="hidden w-[250px] shrink-0 bg-navy lg:block" />
      <div className="flex-1">
        <div className="h-[68px]" />
        <div className="space-y-4 p-6"><div className="h-9 w-56 animate-pulse rounded-[12px] bg-white" /><div className="h-64 animate-pulse rounded-[12px] bg-white" /></div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}
